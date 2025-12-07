import 'dotenv/config';
import { createServer } from 'http';
import { createYoga } from 'graphql-yoga';
import { getSchema } from './schema';
import './mqtt'; // Initialize MQTT connection

console.log('Starting MQTT-GraphQL Service...');

const yoga = createYoga({
    // Dynamically generate schema on every request to reflect latest MQTT topics
    schema: () => getSchema(),
    graphqlEndpoint: '/graphql',
    graphiql: true, // Enable GraphiQL IDE
});

const server = createServer(yoga);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/graphql`);
});
