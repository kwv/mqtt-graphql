
import { store } from '../src/store';
import { getSchema } from '../src/schema';
import { invalidateSchema, schemaCachePromise } from '../src/mqtt';
import { graphql } from 'graphql';

describe('Schema Integration', () => {
  beforeEach(() => {
    // Reset store mostly for cleanliness, though Store doesn't have a clear methods for it aside from creating new instance.
    // Since getSchema imports the singleton store, we might have state leak. 
    // Ideally we'd refactor Schema to accept a store instance, but for now we'll just overwrite keys.
    store.update('test/a', '1');
  });

  test('should generate correct schema structure', async () => {
    store.update('house/room/temp', '20');

    const schema = getSchema();
    const query = `
      query {
        house {
          room {
            temp
          }
        }
      }
    `;

    const result = await graphql({ schema, source: query });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      house: {
        room: {
          temp: 20
        }
      }
    });
  });

  test('should support wildcard match query', async () => {
    store.update('sensor/1/val', '10');
    store.update('sensor/2/val', '20');

    const schema = getSchema();
    const query = `
      query {
        match(pattern: "sensor/+/val") {
          path
          value
        }
      }
    `;

    const result = await graphql({ schema, source: query });
    expect(result.errors).toBeUndefined();
    // @ts-ignore
    const matches = result.data.match;
    expect(matches).toHaveLength(2);
    expect(matches).toEqual(expect.arrayContaining([
      { path: 'sensor/1/val', value: 10 },
      { path: 'sensor/2/val', value: 20 }
    ]));
  });

  test('should allow querying flattened sub-fields', async () => {
    store.update('device/lock', JSON.stringify({
      state: {
        isLocked: true,
        battery: 90
      }
    }));

    const schema = getSchema();
    const query = `
        query {
          device {
            lock {
              state {
                isLocked
                battery
              }
            }
          }
        }
      `;

    const result = await graphql({ schema, source: query });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      device: {
        lock: {
          state: {
            isLocked: true,
            battery: 90
          }
        }
      }
    });
  });

  test('should refresh schema async on invalidation', async () => {
    store.update('initial/value', '1');
    
    // Trigger async schema invalidation
    invalidateSchema();
    
    // Wait for the promise to resolve
    const newSchema = await schemaCachePromise;
    expect(newSchema).toBeDefined();
    
    // Add a new topic after invalidation
    store.update('new/topic', '42');
    invalidateSchema();
    await schemaCachePromise;
    
    // Query the newly added topic
    const schema = getSchema();
    const query = `
      query {
        new {
          topic
        }
      }
    `;
    
    const result = await graphql({ schema, source: query });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      new: {
        topic: 42
      }
    });
  });
});
