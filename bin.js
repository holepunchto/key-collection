#!/usr/bin/env node

const os = require('os')
const path = require('path')
const fsProm = require('fs/promises')

const goodbye = require('graceful-goodbye')
const IdEnc = require('hypercore-id-encoding')
const yaml = require('yaml')
const { command, flag, arg } = require('paparam')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const KeyCollection = require('.')

const DEFAULT_STORAGE = path.join(os.homedir(), '.key-collection')
const logger = console

const sync = command('sync',
  arg('<location>', 'YAML file location to sync against'),
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE}`),
  async function ({ args, flags }) {
    const location = path.resolve(args.location)
    const storage = path.resolve(flags.storage || DEFAULT_STORAGE)
    let swarm = null // Created after we verified all the rest is ok, to avoid needless swarming

    logger.info(`Using storage at ${storage}`)
    logger.info(`Parsing desired state from ${location}`)

    const store = new Corestore(storage)
    const core = store.get({ name: 'db-core' })
    const keyColl = new KeyCollection(core)

    goodbye(async () => {
      logger.info('\nShutting down...')
      if (swarm) await swarm.destroy()
      await store.close()
    })

    const desiredState = await parseYaml(location)

    logger.info('Syncing...')
    await keyColl.sync(desiredState)
    logger.info('Successfully synced')
    logger.info('\nCurrent state:')
    for (const [key, { name }] of await keyColl.toMap()) {
      logger.info(`${key} -> ${name}`)
    }

    swarm = new Hyperswarm()
    swarm.on('connection', conn => {
      logger.info('Swarm opened connection')
      store.replicate(conn)
      conn.on('close', () => { logger.info('Swarm closed connection') })
    })
    swarm.join(keyColl.discoveryKey)

    logger.info(`\nSwarming the database on public key: ${IdEnc.normalize(keyColl.key)} (ctrl-c to stop)`)
  }
)

async function parseYaml (location) {
  const content = await fsProm.readFile(location, { encoding: 'utf-8' })
  const rawDesiredState = await yaml.parse(content)

  const res = new Map()
  for (const [key, value] of Object.entries(rawDesiredState)) {
    res.set(KeyCollection.normKey(key), { name: value?.name || '' })
  }

  return res
}

const cmd = command('key-collection', sync)
cmd.parse()
