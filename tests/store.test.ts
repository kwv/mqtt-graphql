
import { Store } from '../src/store';

describe('Store', () => {
    let store: Store;

    beforeEach(() => {
        store = new Store();
    });

    describe('Type Inference', () => {
        test('should infer numbers', () => {
            store.update('test/num', '123.45');
            expect(store.get('test/num')).toBe(123.45);
        });

        test('should infer booleans', () => {
            store.update('test/bool/true', 'true');
            store.update('test/bool/false', 'FALSE');
            expect(store.get('test/bool/true')).toBe(true);
            expect(store.get('test/bool/false')).toBe(false);
        });

        test('should parse JSON', () => {
            const obj = { foo: 'bar', baz: 1 };
            store.update('test/json', JSON.stringify(obj));
            expect(store.get('test/json')).toEqual(obj);
        });

        test('should fallback to string', () => {
            store.update('test/str', 'hello world');
            expect(store.get('test/str')).toBe('hello world');
        });

        test('should handle valid json-looking strings properly (keep as json)', () => {
            // "123" is valid JSON, but we handle it as number via JSON.parse usually
            store.update('test/val', '123');
            expect(store.get('test/val')).toBe(123);
        });

        test('should deeply flatten JSON objects', () => {
            store.update('flatten/me', JSON.stringify({
                a: 1,
                b: {
                    c: "hello"
                }
            }));

            // Root is stored as object
            expect(store.get('flatten/me')).toEqual({ a: 1, b: { c: "hello" } });
            // Sub-keys are stored as individual paths
            expect(store.get('flatten/me/a')).toBe(1);
            expect(store.get('flatten/me/b')).toEqual({ c: "hello" });
            expect(store.get('flatten/me/b/c')).toBe("hello");
        });
    });

    describe('Wildcard Matching', () => {
        beforeEach(() => {
            store.update('home/kitchen/light', 'on');
            store.update('home/livingroom/light', 'off');
            store.update('home/kitchen/temp', '22');
            store.update('office/light', 'on');
        });

        test('should match single level wildcards (+)', () => {
            const results = store.match('home/+/light');
            expect(results).toHaveLength(2);
            expect(results).toContainEqual({ path: 'home/kitchen/light', value: 'on' });
            expect(results).toContainEqual({ path: 'home/livingroom/light', value: 'off' });
        });

        test('should match multi-level wildcards (#)', () => {
            const results = store.match('home/#');
            expect(results).toHaveLength(3);
            // specific order not guaranteed, check content
            const paths = results.map(r => r.path);
            expect(paths).toContain('home/kitchen/light');
            expect(paths).toContain('home/livingroom/light');
            expect(paths).toContain('home/kitchen/temp');
            expect(paths).not.toContain('office/light');
        });

        test('should match exact path', () => {
            const results = store.match('home/kitchen/temp');
            expect(results).toHaveLength(1);
            expect(results[0].value).toBe(22);
        });
    });
});
