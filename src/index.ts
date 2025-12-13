import { createServer } from 'http';
import { createYoga } from 'graphql-yoga';
import { getSchema } from './schema';
import { schemaCachePromise } from './mqtt';
import { version } from '../package.json';
import './mqtt'; // Initialize MQTT connection

console.log(`Starting MQTT-GraphQL Service v${version}...`);

const yoga = createYoga({
    // Dynamically generate schema on every request to reflect latest MQTT topics
    schema: async () => schemaCachePromise || getSchema(),
    graphqlEndpoint: '/',
    graphiql: true, // Enable GraphiQL IDE
    landingPage: false
});

const server = createServer(yoga);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/`);
});
