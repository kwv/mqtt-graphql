
import { store } from '../src/store';
import { getSchema } from '../src/schema';
import { graphql } from 'graphql';

describe('Z-Wave Heterogeneous Keys', () => {
    beforeEach(() => {
        // Clear store
        const data = store.getAll();
        for (const key of data.keys()) {
            store.delete(key);
        }
    });

    test('should treat heterogeneous numeric keys as an Object, not a List', async () => {
        // Z-Wave Scenario: Keys are Command Class IDs (numbers), but they are NOT a list of similar items.
        // They are distinct functional blocks.
        store.update('zwave/node/113', JSON.stringify({ alarmType: 1, level: 2 }));
        store.update('zwave/node/132', JSON.stringify({ meterValue: 50.5, unit: "W" }));

        const schema = getSchema();

        // If treated as a List (current buggy behavior for numeric keys), 
        // the field 'node' would return a List, and we couldn't query specific keys like '_113'.
        // We want it to remain an Object so we can access specific command classes.

        const query = `
            query {
                zwave {
                    node {
                        _113 {
                            alarmType
                        }
                        _132 {
                            meterValue
                        }
                    }
                }
            }
        `;

        const result = await graphql({ schema, source: query });

        // This fails if 'node' is a List type
        expect(result.errors).toBeUndefined();
        // @ts-ignore
        expect(result.data.zwave.node._113.alarmType).toEqual(1);
        // @ts-ignore
        expect(result.data.zwave.node._132.meterValue).toEqual(50.5);
    });

    test('should still treat homogeneous keys as a List (Notifications)', async () => {
        // Regression Check: Ensure Notifications still work as a List
        store.update('state/notifications/145', JSON.stringify({ id: 145, expiresAt: 100 }));
        store.update('state/notifications/146', JSON.stringify({ id: 146, expiresAt: 200 }));

        const schema = getSchema();
        const query = `
            query {
                state {
                    notifications(filterField: "expiresAt", filterOp: "GT", filterValue: "150") {
                        id
                    }
                }
            }
        `;

        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        // @ts-ignore
        expect(result.data.state.notifications).toHaveLength(1);
    });
});
