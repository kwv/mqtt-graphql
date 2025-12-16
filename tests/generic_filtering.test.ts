
import { store } from '../src/store';
import { getSchema } from '../src/schema';
import { graphql } from 'graphql';

describe('Generic Schema Filtering', () => {
    beforeEach(() => {
        // Clear store
        const data = store.getAll();
        for (const key of data.keys()) {
            store.delete(key);
        }
    });

    test('should filter numeric field with LT', async () => {
        const notifications = [
            { id: '1', expiresAt: 1000 },
            { id: '2', expiresAt: 2000 },
            { id: '3', expiresAt: 3000 }
        ];
        store.update('state/notifications', JSON.stringify(notifications));

        const schema = getSchema();
        const query = `
            query {
                state {
                    notifications(filterField: "expiresAt", filterOp: "LT", filterValue: "2500") {
                        id
                        expiresAt
                    }
                }
            }
        `;

        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        // @ts-ignore
        const data = result.data.state.notifications;
        expect(data).toHaveLength(2);
        expect(data.map((n: any) => n.id)).toEqual(['1', '2']);
    });

    test('should filter string field with EQ', async () => {
        const logs = [
            { msg: 'A', level: 'INFO' },
            { msg: 'B', level: 'ERROR' },
            { msg: 'C', level: 'INFO' }
        ];
        store.update('system/logs', JSON.stringify(logs));

        const schema = getSchema();
        const query = `
            query {
                system {
                    logs(filterField: "level", filterOp: "EQ", filterValue: "ERROR") {
                        msg
                        level
                    }
                }
            }
        `;

        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        // @ts-ignore
        const data = result.data.system.logs;
        expect(data).toHaveLength(1);
        expect(data[0].msg).toEqual('B');
    });

    test('should handle invalid field gracefully (return empty or full list?)', async () => {
        // Current implementation implementation checks property, undefined is compared. 
        // undefined < 2500 is false. undefined == "ERROR" is false.
        // So it should act as "no match".
        const items = [{ val: 1 }, { val: 2 }];
        store.update('test/items', JSON.stringify(items));
        const schema = getSchema();
        const query = `
            query {
                test {
                    items(filterField: "nonExistent", filterOp: "EQ", filterValue: "1") {
                        val
                    }
                }
            }
         `;
        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        // @ts-ignore
        expect(result.data.test.items).toHaveLength(0);
    });

    // Test for dynamic type generation correctness
    test('should include keys from first item in schema', async () => {
        const items = [{ mySpecialKey: 'hello' }];
        store.update('test/schema', JSON.stringify(items));
        const schema = getSchema();

        // Try to query the special key
        const query = `query { test { schema { mySpecialKey } } }`;
        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        // @ts-ignore
        expect(result.data.test.schema[0].mySpecialKey).toEqual('hello');
    });
});
