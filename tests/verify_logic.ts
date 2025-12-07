import { store } from '../src/store';
import { getSchema } from '../src/schema';
import { graphql } from 'graphql';
import assert from 'assert';

async function run() {
    console.log('Test: Populating Store...');
    store.update('home/livingroom/temp', '22.5');
    store.update('home/kitchen/light', 'on');
    store.update('office/sensor/humidity', '60');

    console.log('Test: Generating Schema...');
    const schema = getSchema();

    console.log('Test: Querying Direct Field...');
    const query = '{ home { livingroom { temp } } }';
    const result = await graphql({ schema, source: query });

    console.log('Result:', JSON.stringify(result, null, 2));
    assert(result.data?.home, 'Home should exist');
    // @ts-ignore
    assert.equal(result.data?.home?.livingroom?.temp, 22.5);

    console.log('Test: Querying Wildcard Match...');
    const query2 = '{ match(pattern: "home/+/light") { path value } }';
    const result2 = await graphql({ schema, source: query2 });
    console.log('Match Result:', JSON.stringify(result2, null, 2));
    // @ts-ignore
    assert.equal(result2.data?.match[0].value, "on");

    console.log('Verification Passed!');
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
