import {
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLFloat,
    GraphQLBoolean,
    GraphQLList,
    GraphQLNonNull,
    GraphQLScalarType,
    Kind
} from 'graphql';
import { store, TopicValue } from './store';

// Custom JSON scalar for flexible payloads
const JSONScalar = new GraphQLScalarType({
    name: 'JSON',
    description: 'The `JSON` scalar type represents JSON values.',
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => {
        switch (ast.kind) {
            case Kind.STRING: return JSON.parse(ast.value);
            case Kind.INT: return parseInt(ast.value, 10);
            case Kind.FLOAT: return parseFloat(ast.value);
            case Kind.BOOLEAN: return ast.value;
            default: return null;
        }
    }
});

const TopicResultType = new GraphQLObjectType({
    name: 'TopicResult',
    fields: {
        path: { type: new GraphQLNonNull(GraphQLString) },
        value: { type: JSONScalar }
    }
});

function sanitize(str: string) {
  let val = str;

  // 1. Replace any field name starting with "__" with "_"
  val = val.replace(/^__/, '_');

  // 2. Replace any invalid characters (non-alphanumeric or non-underscore) with "_"
  val = val.replace(/[^a-zA-Z0-9_]/g, '_');

  // 3. Ensure field name doesn't start with a number
  if (/^[0-9]/.test(val)) {
    val = '_' + val;
  }

  return val || '_empty';
}

// Tree node interface
interface TreeNode {
    _path?: string;
    _value?: TopicValue;
    [key: string]: TreeNode | string | TopicValue | undefined;
}

let cachedSchema: GraphQLSchema | null = null;
let lastTreeHash = '';

// Simple hash/versioning could be added to Store to avoid full rebuilds
// For now, we rebuild if the simplistic check fails or just rebuild per request (it's fast enough for homelab)

export function getSchema(): GraphQLSchema {
    const data = store.getAll();
    const root: TreeNode = {};

    // 1. Build Tree
    for (const [topic, value] of data.entries()) {
        const parts = topic.split('/');
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (typeof current[part] !== 'object') {
                current[part] = { _path: parts.slice(0, i + 1).join('/') };
            }
            current = current[part] as TreeNode;
        }
        current._value = value;
    }

    // Helper to recursively build a plain JSON object from a TreeNode
    const buildTree = (node: TreeNode): any => {
        const result: any = {};

        // If this node has a direct value, include it (optional design choice: 
        // strictly speaking _tree might just be children, but including _value 
        // allows it to represent the "full state" at this node)
        if (node._path && store.get(node._path) !== undefined) {
            result._value = store.get(node._path);
        }

        const keys = Object.keys(node).sort();
        for (const key of keys) {
            if (key.startsWith('_')) continue;

            const childNode = node[key] as TreeNode;
            // Check if child is a leaf or has children
            const grandChildren = Object.keys(childNode).filter(k => !k.startsWith('_'));

            if (grandChildren.length > 0) {
                result[key] = buildTree(childNode);
            } else {
                // It's a leaf, just get the value
                if (childNode._path) {
                    result[key] = store.get(childNode._path);
                }
            }
        }
        return result;
    };

    // 2. Recursive Type Builder
    const createType = (name: string, obj: TreeNode): GraphQLObjectType => {
        const fields: any = {};

        // Sort keys for consistent schema
        const keys = Object.keys(obj).sort();

        for (const key of keys) {
            if (key.startsWith('_')) continue;

            const node = obj[key] as TreeNode;
            const children = Object.keys(node).filter(k => !k.startsWith('_'));
            const hasChildren = children.length > 0;

            // Resolve value from store dynamically
            const resolve = () => {
                if (node._path) return store.get(node._path);
                return null;
            };

            // Dynamic List Handling (Arrays) initialization
            const rawValue = node._path ? store.get(node._path) : null;
            if (Array.isArray(rawValue) && rawValue.length > 0 && typeof rawValue[0] === 'object') {
                // Feature: Generic Dynamic Filtering for Lists
                // 1. Generate Type for Item based on first element (best effort)
                const firstItem = rawValue[0];
                const itemTypeName = `${name}_${sanitize(key)}_Item`;
                const itemFields: any = {};

                Object.keys(firstItem).forEach(k => {
                    const v = firstItem[k];
                    let type: any = GraphQLString;
                    if (typeof v === 'number') type = GraphQLFloat;
                    else if (typeof v === 'boolean') type = GraphQLBoolean;
                    // For now, nested objects in list are just JSON
                    else if (typeof v === 'object') type = JSONScalar;

                    itemFields[sanitize(k)] = { type };
                });
                // Ensure _item backup exists
                itemFields['_item'] = { type: JSONScalar, resolve: (r: any) => r };

                const ItemType = new GraphQLObjectType({
                    name: itemTypeName,
                    fields: itemFields
                });

                fields[sanitize(key)] = {
                    type: new GraphQLList(ItemType),
                    args: {
                        filterField: { type: GraphQLString },
                        filterOp: { type: GraphQLString },
                        filterValue: { type: GraphQLString }
                    },
                    resolve: (_: any, args: any) => {
                        const list = store.get(node._path!) as any[];
                        if (!list) return [];

                        const { filterField, filterOp, filterValue } = args;

                        if (filterField && filterOp && filterValue !== undefined) {
                            return list.filter(item => {
                                let actual = item[filterField];
                                let target: any = filterValue;

                                // Basic type inference for comparison
                                if (typeof actual === 'number') {
                                    const p = parseFloat(filterValue);
                                    if (!isNaN(p)) target = p;
                                }

                                switch (filterOp) {
                                    case 'EQ': return actual == target;
                                    case 'NEQ': return actual != target;
                                    case 'GT': return actual > target;
                                    case 'LT': return actual < target;
                                    case 'GTE': return actual >= target;
                                    case 'LTE': return actual <= target;
                                    case 'CONTAINS': return String(actual).includes(String(target));
                                    default: return true;
                                }
                            });
                        }
                        return list;
                    }
                };
                continue;
            } else if (hasChildren) {
                // Feature: Map-like Object Filtering
                // Check if this node looks like a collection of objects (all children are objects)
                // We use a heuristic: if it has > 0 children and (at least one) child is an object,
                // we treat it as a potential collection.
                // For simplicity, we'll try to generate a common item type based on the first child that is an object.

                const childKeys = Object.keys(node).filter(k => !k.startsWith('_'));
                const firstChildKey = childKeys.find(k => {
                    const c = node[k];
                    // Verify child is a TreeNode (object) and has its own structure (not just a path with scalar value)
                    // In our valid Tree, everything is an object, but we want to check if it has "fields".
                    // Actually, even a leaf node is ` { _path: ... }`.
                    // We want to check if the child represents an "Entity" (has more than just _path).
                    // Or simply if the user wants to filter ANY list of children.
                    return typeof c === 'object';
                });

                let isCollection = false;
                let ItemType: GraphQLObjectType | null = null;

                if (firstChildKey) {
                    const firstChildNode = node[firstChildKey] as TreeNode;
                    // To generate an ItemType, we look at the keys of this child.
                    // Only treat as collection if the child actually has properties (other than _path).
                    // This avoids treating `state/temp: 20` (which is {temp: {_path...}}) as a collection of "temp", 
                    // although technically it is a collection of 1 item??
                    // Let's stick to the user's case: `notifications/123/ { id, expiresAt ... }`
                    // The child `123` has keys `id`, `expiresAt`.
                    const firstChildProps = Object.keys(firstChildNode).filter(k => !k.startsWith('_'));

                    // Heuristic Refinement:
                    // Only treat as a "Collection" (List) if the keys look like IDs (start with specific chars)
                    // or if we have strong evidence of homogeneity.
                    // The "Cannot query field" regression happened because `device/lock/state` 
                    // (where `state` is a property) was treated as a collection of 1 item with key `state`.
                    //
                    // Current User Constraint: Keys start with numbers (e.g. "145...").
                    // Fix: Check if keys are numeric.
                    const areKeysNumeric = childKeys.every(k => /^[0-9]/.test(k));

                    // Refinement 2: Homogeneity & Key Length Check
                    // Z-Wave issue: Keys '113' and '132' are numeric but have different shapes (different Command Classes).
                    // Notifications: Keys are long IDs and have same shape.

                    let looksLikeList = false;

                    if (areKeysNumeric && childKeys.length > 0) {
                        if (childKeys.length > 1) {
                            // Check Homogeneity (Duck Typing)
                            const first = node[childKeys[0]] as TreeNode;
                            const second = node[childKeys[1]] as TreeNode;
                            const keys1 = Object.keys(first).filter(k => !k.startsWith('_'));
                            const keys2 = Object.keys(second).filter(k => !k.startsWith('_'));

                            // Intersection
                            const intersection = keys1.filter(k => keys2.includes(k));
                            const union = new Set([...keys1, ...keys2]);

                            // If they share at least 50% of keys, they are likely the same type
                            // Or if they share ALL keys (ideal).
                            // Notifications likely share 'expiresAt', 'id', 'channel', 'messageId'.
                            // Z-Wave '113' (alarm) vs '132' (meter) likely share 0 keys.

                            if (union.size > 0) {
                                const overlapRatio = intersection.length / union.size;
                                if (overlapRatio >= 0.3) {
                                    looksLikeList = true;
                                }
                            } else {
                                looksLikeList = true;
                            }

                            // OVERRIDE: Homogeneity check is unsafe for small structural objects (like Z-Wave endpoints).
                            // Example: 113/0 and 132/0 share key "0" -> 100% overlap -> detected as List -> BROKEN.
                            // Fix: Enforce Key Length Heuristic.
                            // Real "Lists" of data usually use UUIDs, Timestamps, or Hash keys (Long).
                            // Z-Wave/Zigbee structure uses short specific IDs (Short).
                            // Threshold: 6 characters (e.g. "123456" is ambiguous, "145033..." is definitely an ID).

                            const firstKey = childKeys[0];
                            if (firstKey.length <= 6) {
                                looksLikeList = false;
                            }
                        } else {
                            // Only 1 child. 
                            if (childKeys[0].length > 6) {
                                looksLikeList = true;
                            }
                        }
                    }

                    if (firstChildProps.length > 0 && looksLikeList) {
                        isCollection = true;

                        // Generate Item Type
                        const itemTypeName = `${name}_${sanitize(key)}_Item`;

                        const itemFields: any = {};

                        for (const prop of firstChildProps) {
                            // We need to determine the type of the property.
                            // We can use the existing createsType logic recursively if needed?
                            // Or just simple scalar logic for now as this is "Object Filtering" (usually 1 level deep).
                            // Let's try to support nested objects in items too by checking the child node.
                            const propNode = firstChildNode[prop] as TreeNode;

                            // Determine type
                            const propVal = propNode._path ? store.get(propNode._path) : undefined;
                            let propType: any = GraphQLString;
                            if (typeof propVal === 'number') propType = GraphQLFloat;
                            else if (typeof propVal === 'boolean') propType = GraphQLBoolean;

                            // If property is itself an object, simple JSON for now to avoid infinite complexity
                            // or simple generic object.
                            itemFields[sanitize(prop)] = { type: propType };

                            // Also support resolving it!
                            // The item in the list will be the `firstChildNode` (the TreeNode).
                            itemFields[sanitize(prop)].resolve = (itemNode: TreeNode) => {
                                // itemNode is the node for the item (e.g. `notifications/1`).
                                // We want `itemNode[prop]`.
                                const child = itemNode[prop] as TreeNode;
                                return child && child._path ? store.get(child._path) : null;
                            };
                        }

                        ItemType = new GraphQLObjectType({
                            name: itemTypeName,
                            fields: itemFields
                        });
                    }
                }

                if (isCollection && ItemType) {
                    // It is a collection! Expose as a List with Filters.
                    fields[sanitize(key)] = {
                        type: new GraphQLList(ItemType),
                        args: {
                            filterField: { type: GraphQLString },
                            filterOp: { type: GraphQLString },
                            filterValue: { type: GraphQLString }
                        },
                        resolve: (_: any, args: any) => {
                            // Parent node is `node` (the collection root).
                            // Children are `node[childKey]`.
                            const childKeys = Object.keys(node).filter(k => !k.startsWith('_'));
                            let items = childKeys.map(k => node[k] as TreeNode);

                            const { filterField, filterOp, filterValue } = args;

                            if (filterField && filterOp && filterValue !== undefined) {
                                items = items.filter(itemNode => {
                                    // Get value of the filter field from the itemNode
                                    // itemNode is e.g. "notifications/1"
                                    // filterField is "expiresAt"
                                    // We need to look up "notifications/1/expiresAt"
                                    const fieldNode = itemNode[filterField] as TreeNode;
                                    if (!fieldNode || !fieldNode._path) return false;

                                    let actual = store.get(fieldNode._path);
                                    let target: any = filterValue;

                                    if (typeof actual === 'number') {
                                        const p = parseFloat(filterValue);
                                        if (!isNaN(p)) target = p;
                                    }

                                    switch (filterOp) {
                                        case 'EQ': return actual == target;
                                        case 'NEQ': return actual != target;
                                        case 'GT': return actual > target;
                                        case 'LT': return actual < target;
                                        case 'GTE': return actual >= target;
                                        case 'LTE': return actual <= target;
                                        case 'CONTAINS': return String(actual).includes(String(target));
                                        default: return true;
                                    }
                                });
                            }
                            return items;
                        }
                    };
                } else {
                    // Fallback to standard Object behavior (recurse)
                    const typeName = `${name}_${sanitize(key)}`;
                    fields[sanitize(key)] = {
                        type: createType(typeName, node),
                        resolve: () => node
                    };
                }
            } else {
                // It's a leaf. Determine type from current value (best effort)
                const val = store.get(node._path!);
                let type: any = GraphQLString;
                if (typeof val === 'number') type = GraphQLFloat;
                else if (typeof val === 'boolean') type = GraphQLBoolean;
                else if (typeof val === 'object') type = JSONScalar; // Handle JSON leaves

                fields[sanitize(key)] = {
                    type: type,
                    resolve
                };
            }
        }

        // Embed value if this node is both a container and a value
        if (obj._path && store.get(obj._path) !== undefined) {
            const val = store.get(obj._path);
            let type: any = GraphQLString;
            if (typeof val === 'number') type = GraphQLFloat;
            else if (typeof val === 'boolean') type = GraphQLBoolean;
            else if (typeof val === 'object') type = JSONScalar;

            fields['_value'] = {
                type: type,
                resolve: () => store.get(obj._path!)
            };
        }

        // Always add _tree to roll up everything from this level down
        fields['_tree'] = {
            type: JSONScalar,
            resolve: () => buildTree(obj)
        };

        return new GraphQLObjectType({
            name,
            fields: Object.keys(fields).length > 0 ? fields : { _empty: { type: GraphQLString } }
        });
    };

    const rootQuery = new GraphQLObjectType({
        name: 'Query',
        fields: {
            match: {
                type: new GraphQLList(new GraphQLNonNull(TopicResultType)),
                args: {
                    pattern: { type: new GraphQLNonNull(GraphQLString) }
                },
                resolve: (_, { pattern }) => store.match(pattern)
            },
            // Spread top-level nodes
            ...(() => {
                const dynamicFields: any = {};
                const rootType = createType('Root', root);
                const rootFields = rootType.getFields();

                // We can't just spread fields because createType returns a Type containing fields.
                // But we want the *Root's* fields to be the Query's fields.
                // So we re-use the logic or just iterate root keys here.

                const keys = Object.keys(root).sort();
                for (const key of keys) {
                    if (key.startsWith('_')) continue;
                    const node = root[key] as TreeNode;
                    // We need to generate a type for this top-level node
                    const typeName = `Root_${sanitize(key)}`;
                    // If it has children it's an object, else scalar
                    const children = Object.keys(node).filter(k => !k.startsWith('_'));

                    if (children.length > 0) {
                        dynamicFields[sanitize(key)] = {
                            type: createType(typeName, node),
                            resolve: () => node
                        };
                    } else {
                        // Top level scalar? e.g. topic "temp" -> 22
                        const val = store.get(node._path!);
                        let type: any = GraphQLString;
                        if (typeof val === 'number') type = GraphQLFloat;
                        else if (typeof val === 'boolean') type = GraphQLBoolean;
                        else if (typeof val === 'object') type = JSONScalar;

                        dynamicFields[sanitize(key)] = { type, resolve: () => store.get(node._path!) };
                    }
                }

                // Add _tree to root as well
                dynamicFields['_tree'] = {
                    type: JSONScalar,
                    resolve: () => buildTree(root)
                };

                return dynamicFields;
            })()
        }
    });

    return new GraphQLSchema({ query: rootQuery });
}
