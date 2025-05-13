const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const IdEnc = require('hypercore-id-encoding')

const spec = require('./spec/hyperdb')

class KeyCollection extends ReadyResource {
  constructor (core) {
    super()
    this.db = HyperDB.bee(core, spec, { autoUpdate: true }) // TODO: needed? (we only update through this class)
  }

  async _open () {
    await this.db.ready()
  }

  async _close () {
    await this.db.close()
  }

  async toMap () {
    if (!this.opened) await this.ready()

    const res = new Map()
    for await (const entry of this.db.find('@key-collection/key-entries')) {
      res.set(normKey(entry.key), { name: entry.name })
    }

    return res
  }

  async sync (desiredState) { // Not safe to call multiple times in parallel
    desiredState = normKeys(desiredState)
    const desiredKeys = new Set([...desiredState.keys()])
    const existingEntries = await this.toMap()

    const toDel = new Set()
    const toAdd = new Set()
    for (const key of existingEntries.keys()) {
      if (!desiredKeys.has(key)) toDel.add(key)
    }

    for (const key of desiredState.keys()) {
      if (!existingEntries.has(key)) toAdd.add(key)
    }

    const tx = this.db.transaction()

    const proms = []
    for (const key of toAdd) {
      proms.push(
        tx.insert(
          '@key-collection/key-entries',
          { key: IdEnc.decode(key), ...desiredState.get(key) }
        )
      )
    }
    for (const key of toDel) {
      proms.push(
        tx.delete(
          '@key-collection/key-entries',
          { key: IdEnc.decode(key) }
        )
      )
    }
    await Promise.all(proms)
    await tx.flush()
  }

  static normKey (key) {
    return normKey(key)
  }
}

function normKey (key) {
  return IdEnc.normalize(key)
}

function normKeys (desiredState) {
  const res = new Map()
  for (const [key, value] of desiredState) {
    const name = value.name || ''
    res.set(normKey(key), { name })
  }

  return res
}

module.exports = KeyCollection
