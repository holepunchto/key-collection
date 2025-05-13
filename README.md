# Key Collection

A [hyperdb](https://github.com/holepunchto/hyperdb)-based collection of 32-byte keys.

## Install

```
npm i -g key-collection
```

## Usage

### Create

```
key-collection sync <location>
```

Where `<location>` is the path of a yaml file structed like [example.yml](example.yml).

This will first sync the database with the yaml file, deleting and adding entries as required, and then seed the database.

### Consume

```
const KeyCollection = require('key-collection')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const IdEnc = require('hypercore-id-encoding')

async function main () {
  const key = IdEnc.decode('your key here') // Fill in with the public key of the collection db, as printed in the previous step

  const store = new Corestore('key-collection-store')
  const core = store.get({ key })
  const keyColl = new KeyCollection(core)
  await keyColl.ready()

  const swarm = new Hyperswarm()
  swarm.on('connection', (conn) => {
    console.log('connection opened')
    store.replicate(conn)
  })

  swarm.join(keyColl.discoveryKey, { client: true, server: false })
  console.log(await keyColl.toMap()) // will print an empty map the first time it runs
}

main()
```
