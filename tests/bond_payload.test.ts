import { store } from '../src/store';
import { getSchema } from '../src/schema';
import { graphql } from 'graphql';

describe('Bond Payload Handling', () => {
    beforeEach(() => {
        // Clear store
        for (const key of Array.from(store.getAll().keys())) {
            store.delete(key);
        }
    });

    test('should handle Bond ToggleLight action payload with reserved keys', async () => {
        // Exact payload from user's error - the payload gets flattened by store
        store.update('bondhome/devices/test/actions/ToggleLight', JSON.stringify({
            "argument": null,
            "_lock_priority": 50,
            "_lock_expiration": 0,
            "no_tx": true,
            "_": "00000000",
            "__": "00000000"
        }));

        // Should not throw during schema generation - this is the key test
        let schema;
        expect(() => {
            schema = getSchema();
        }).not.toThrow();

        // Query the flattened fields using sanitized names
        const query = `
            query {
                bondhome {
                    devices {
                        test {
                            actions {
                                ToggleLight {
                                    _lock_priority
                                    _
                                }
                            }
                        }
                    }
                }
            }
        `;

        const result = await graphql({ schema: schema!, source: query });
        expect(result.errors).toBeUndefined();
        expect(result.data?.bondhome?.devices?.test?.actions?.ToggleLight?._lock_priority).toBe(50);
        expect(result.data?.bondhome?.devices?.test?.actions?.ToggleLight?._).toBe('00000000');
    });

    test('should handle Bond hash tree structure with _ and __ keys', async () => {
        // Simulate Bond API hash tree response
        store.update('bondhome/device/fan', JSON.stringify({
            "_": "599b0fc5",
            "name": "Ceiling Fan",
            "type": "CF",
            "__ver": "v2.1.0"
        }));

        let schema;
        expect(() => {
            schema = getSchema();
        }).not.toThrow();

        // Query the sanitized fields
        const query = `
            query {
                bondhome {
                    device {
                        fan {
                            _
                            name
                            type
                            _ver
                        }
                    }
                }
            }
        `;

        const result = await graphql({ schema: schema!, source: query });
        expect(result.errors).toBeUndefined();
        expect(result.data?.bondhome?.device?.fan?._).toBe('599b0fc5');
        expect(result.data?.bondhome?.device?.fan?.name).toBe('Ceiling Fan');
        expect(result.data?.bondhome?.device?.fan?.type).toBe('CF');
        expect(result.data?.bondhome?.device?.fan?._ver).toBe('v2.1.0');
    });

    test('should handle topics with multiple levels of reserved keys', async () => {
        // Edge case: multiple levels with problematic keys
        store.update('test/__ver', '1.0');
        store.update('test/__/nested', 'value');
        store.update('test/_/another', 'value2');

        let schema;
        expect(() => {
            schema = getSchema();
        }).not.toThrow();

        const query = `
            query {
                test {
                    _ver
                    _ {
                        nested
                    }
                }
            }
        `;

        const result = await graphql({ schema: schema!, source: query });
        expect(result.errors).toBeUndefined();
        expect(result.data?.test?._ver).toBe(1.0);
        expect(result.data?.test?._?.nested).toBe('value');
    });

    test('should ensure type names do not contain double underscores', async () => {
        // This tests that our sanitization of type names works correctly
        store.update('root/__reserved/child', 'value');

        let schema;
        expect(() => {
            schema = getSchema();
        }).not.toThrow();

        // Introspection query to check type names
        const introspectionQuery = `
            {
                __schema {
                    types {
                        name
                    }
                }
            }
        `;

        const result = await graphql({ schema: schema!, source: introspectionQuery });
        expect(result.errors).toBeUndefined();

        const typeNames = result.data?.__schema?.types.map((t: any) => t.name) || [];

        // Check that no type names start with __ (except built-in introspection types)
        const userTypes = typeNames.filter((name: string) =>
            name.startsWith('Root') || name.includes('reserved')
        );

        for (const typeName of userTypes) {
            // User-defined types should not contain __
            expect(typeName).not.toMatch(/__/);
        }
    });
});
