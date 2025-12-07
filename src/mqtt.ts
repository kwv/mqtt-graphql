import mqtt from 'mqtt';
import { store } from './store';

// Default to localhost, can be overridden by env for Docker
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const TOPIC_ROOT = process.env.MQTT_TOPIC_ROOT || '#';

console.log(`Initializing MQTT Client... Broker: ${BROKER_URL}`);

const options: mqtt.IClientOptions = {};
if (process.env.MQTT_USERNAME) options.username = process.env.MQTT_USERNAME;
if (process.env.MQTT_PASSWORD) options.password = process.env.MQTT_PASSWORD;

export const client = mqtt.connect(BROKER_URL, options);

client.on('connect', () => {
    console.log(`Connected to MQTT broker at ${BROKER_URL}`);
    client.subscribe(TOPIC_ROOT, (err) => {
        if (err) {
            console.error('Failed to subscribe to topics:', err);
        } else {
            console.log(`Subscribed to topic pattern: ${TOPIC_ROOT}`);
        }
    });
});

client.on('message', (topic, message) => {
    // Update the store
    store.update(topic, message);
});

client.on('error', (err) => {
    console.error('MQTT Connection Error:', err);
});
