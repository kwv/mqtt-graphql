import mqtt from 'mqtt';
import { store } from './store';
import { getSchema } from './schema';
import { GraphQLSchema } from 'graphql';

// Default to localhost, can be overridden by env for Docker
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const TOPIC_ROOT = process.env.MQTT_TOPIC_ROOT || '#';
const IS_TEST = process.env.NODE_ENV === 'test';

if (!IS_TEST) {
    console.log(`Initializing MQTT Client... Broker: ${BROKER_URL}`);
}

const options: mqtt.IClientOptions = {
    // Disable auto-reconnect during tests
    reconnectPeriod: IS_TEST ? 0 : 1000,
};
if (process.env.MQTT_USERNAME) options.username = process.env.MQTT_USERNAME;
if (process.env.MQTT_PASSWORD) options.password = process.env.MQTT_PASSWORD;

export const client = mqtt.connect(BROKER_URL, options);

client.on('connect', () => {
    if (!IS_TEST) {
        console.log(`Connected to MQTT broker at ${BROKER_URL}`);
    }
    client.subscribe(TOPIC_ROOT, (err: any) => {
        if (err && !IS_TEST) {
            console.error('Failed to subscribe to topics:', err);
        } else if (!err && !IS_TEST) {
            console.log(`Subscribed to topic pattern: ${TOPIC_ROOT}`);
        }
    });
});

export let schemaCachePromise: Promise<GraphQLSchema> | null = null;

export function invalidateSchema() {
    // Trigger async rebuild, but don't block the message handler
    schemaCachePromise = buildSchemaAsync();
}

async function buildSchemaAsync(): Promise<GraphQLSchema> {
    // This could be async if your schema building ever involves I/O
    return getSchema();
}

client.on('message', (topic: string, message: Buffer) => {
    store.update(topic, message);
    invalidateSchema(); // Fire and forget async refresh
});

client.on('error', (err: any) => {
    if (!IS_TEST) {
        console.error('MQTT Connection Error:', err);
    }
});
