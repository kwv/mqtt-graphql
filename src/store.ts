export type TopicValue = string | number | boolean | object | null;

export class Store {
    private data = new Map<string, TopicValue>();

    update(topic: string, message: Buffer | string) {
        let value: TopicValue = message.toString();
        try {
            const parsed = JSON.parse(value as string);
            // Ensure we don't treat simple strings as JSON if they just happen to parse (e.g. "123")
            // but standard JSON.parse handles primitives fine.
            value = parsed;
        } catch {
            // Not JSON, try basic inference
            const trimmed = (value as string).trim();
            if (trimmed.toLowerCase() === 'true') {
                value = true;
            } else if (trimmed.toLowerCase() === 'false') {
                value = false;
            } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
                value = Number(trimmed);
            }
        }

        // Recursively flatten and store
        this.storeRecursive(topic, value);
        // console.log(`Stored ${topic}:`, value);
    }

    private storeRecursive(path: string, value: TopicValue) {
        // Always store the current node
        this.data.set(path, value);

        // If it's an object, recurse
        if (typeof value === 'object' && value !== null) {
            for (const key of Object.keys(value)) {
                // Sanitize key to avoid path weirdness if needed,
                // but for now simple slash appending is best for direct mapping.
                // We cast value as any to access keys of unknown object
                this.storeRecursive(`${path}/${key}`, (value as any)[key]);
            }
        }
    }

    get(topic: string) {
        return this.data.get(topic);
    }

    getAll() {
        return this.data;
    }

    match(pattern: string): { path: string, value: TopicValue }[] {
        const results: { path: string, value: TopicValue }[] = [];
        // Convert MQTT wildcard to Regex
        // + matches any single level (no /)
        // # matches multi-level (at the end)
        let regexString = pattern
            .replace(/\+/g, '[^/]+')
            .replace(/#/g, '.*');

        // Escape special chars except the ones we just added? 
        // Actually simpler: 
        // Escape the pattern first, then replace + and # placeholders?
        // But + and # are special in MQTT.
        // Let's do a basic conversion.

        // Safer regex construction:
        const parts = pattern.split('/');
        const regexParts = parts.map(p => {
            if (p === '+') return '[^/]+';
            if (p === '#') return '.*';
            return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars in topic parts
        });
        const regex = new RegExp(`^${regexParts.join('/')}$`);

        for (const [topic, value] of this.data.entries()) {
            if (regex.test(topic)) {
                results.push({ path: topic, value });
            }
        }
        return results;
    }
}

export const store = new Store();
