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
    // Ensure valid GraphQL name
    let val = str.replace(/[^a-zA-Z0-9_]/g, '_');
    if (/^[0-9]/.test(val)) val = '_' + val;
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

            if (hasChildren) {
                // It's a branch, so it MUST be an Object Type
                const typeName = `${name}_${sanitize(key)}`;
                fields[sanitize(key)] = {
                    type: createType(typeName, node),
                    resolve: () => node // Pass the node context down
                };
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
                return dynamicFields;
            })()
        }
    });

    return new GraphQLSchema({ query: rootQuery });
}
