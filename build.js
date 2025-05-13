const path = require('path')
const HyperDB = require('hyperdb/builder')
const Hyperschema = require('hyperschema')

const SCHEMA_DIR = path.join(__dirname, 'spec', 'hyperschema')
const DB_DIR = path.join(__dirname, 'spec', 'hyperdb')

const schema = Hyperschema.from(SCHEMA_DIR)
const nameServiceNs = schema.namespace('key-collection')

nameServiceNs.register({
  name: 'key-entry',
  fields: [
    {
      name: 'key',
      type: 'fixed32',
      required: true
    },
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const dbNs = db.namespace('key-collection')

dbNs.collections.register({
  name: 'key-entries',
  schema: '@key-collection/key-entry',
  key: ['key']
})

HyperDB.toDisk(db)
