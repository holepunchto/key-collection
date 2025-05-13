const test = require('brittle')
const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const KeyCollection = require('.')

test('can sync collection with map', async t => {
  const store = new Corestore(await t.tmp())
  t.teardown(async () => {
    await store.close()
  })
  const core = store.get({ name: 'core' })
  const coll = new KeyCollection(core)

  const key1 = IdEnc.normalize('a'.repeat(64))
  const key2 = IdEnc.normalize('b'.repeat(64))
  const key3 = IdEnc.normalize('c'.repeat(64))

  const keyMap = new Map()
  keyMap.set(key1, { name: 'user1' })
  keyMap.set(key2, { name: 'user2' })

  await coll.sync(keyMap)

  t.alike(await coll.toMap(), keyMap)

  keyMap.delete(key1)
  keyMap.set(key3, { name: 'user3' })
  await coll.sync(keyMap)

  const expected = new Map()
  expected.set(key2, { name: 'user2' })
  expected.set(key3, { name: 'user3' })
  t.alike(await coll.toMap(), expected)
})
