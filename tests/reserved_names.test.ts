
import { store } from '../src/store';
import { getSchema } from '../src/schema';
import { graphql } from 'graphql';

describe('Reserved Names Handling', () => {
    test('should sanitize keys that start with __ but have content', async () => {
        store.update('bondhome/test/payload', JSON.stringify({
            "__ver": "1.0.0",
            "___internal": "secret"
        }));

        const schema = getSchema();
        const query = `
      query {
        bondhome {
          test {
            payload {
              _ver
              _internal
            }
          }
        }
      }
    `;

        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
            bondhome: {
                test: {
                    payload: {
                        _ver: "1.0.0",
                        _internal: "secret"
                    }
                }
            }
        });
    });

    test('should sanitize the literal "__" key', async () => {
        store.update('bondhome/literal/payload', JSON.stringify({
            "__": "some-id"
        }));

        const schema = getSchema();
        const query = `
      query {
        bondhome {
          literal {
            payload {
              _
            }
          }
        }
      }
    `;

        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
            bondhome: {
                literal: {
                    payload: {
                        _: "some-id"
                    }
                }
            }
        });
    });

    test('should handle topics that start with __', async () => {
        store.update('__reserved_topic/value', '123');

        const schema = getSchema();
        const query = `
      query {
        _reserved_topic {
          value
        }
      }
    `;

        const result = await graphql({ schema, source: query });
        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
            _reserved_topic: {
                value: 123
            }
        });
    });
});
