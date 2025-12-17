#!/usr/bin/env node

const os = require('os')
const path = require('path')
const fsProm = require('fs/promises')

const goodbye = require('graceful-goodbye')
const IdEnc = require('hypercore-id-encoding')
const yaml = require('yaml')
const { command, flag, arg, description } = require('paparam')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const rrp = require('resolve-reject-promise')

const KeyCollection = require('.')

const DEFAULT_STORAGE = path.join(os.homedir(), '.key-collection-data', 'corestore')
const DEFAULT_MIN_PEERS = 2
const logger = console

const sync = command('sync',
  description('Sync a key collection you manage with a local yaml file, then swarm it'),
  arg('<location>', 'YAML file location to sync against'),
  flag('--name|-n [name]', 'Namespace to use (defaults to the name of the yaml file, without the extension'),
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE}`),
  async function ({ args, flags }) {
    const location = path.resolve(args.location)
    const name = flags.name || path.parse(location).name
    const storage = path.resolve(flags.storage || DEFAULT_STORAGE)

    let swarm = null // Created after we verified all the rest is ok, to avoid needless swarming

    logger.info(`Using core with name '${name}' in storage at ${storage}`)
    logger.info(`Parsing desired state from ${location}`)

    const store = new Corestore(storage)
    const core = store.get({ name })
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
    swarm.join(keyColl.discoveryKey, { client: true, server: true })

    logger.info(`\nSwarming the database on public key: ${IdEnc.normalize(keyColl.key)} (ctrl-c to stop)`)
  }
)

const list = command('list',
  description('List all entries of a key collection'),
  arg('<key>', 'Key of the collection to list'),
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE}`),
  flag('--min-peers|-m [minPeers]', `Minimum peers to connect to before assuming the list is up to date. Defaults to ${DEFAULT_MIN_PEERS}`),
  async function ({ args, flags }) {
    const key = IdEnc.decode(args.key)
    const storage = path.resolve(flags.storage || DEFAULT_STORAGE)
    const minPeers = parseInt(flags.minPeers || DEFAULT_MIN_PEERS)
    logger.info(`Using storage at ${storage}`)

    const store = new Corestore(storage)
    const core = store.get({ key })
    const keyColl = new KeyCollection(core)
    await keyColl.ready()

    const swarm = new Hyperswarm()

    const { resolve, reject, promise } = rrp()
    const timeoutMs = 5000
    const checkMs = 250
    const errTimeout = setTimeout(
      () => reject(new Error(`Could not connect to at least ${minPeers} peers in ${timeoutMs}ms. Is this collection properly seeded?`)),
      timeoutMs
    )
    const checkInterval = setInterval(() => {
      if (core.peers.length >= minPeers) resolve()
    }, checkMs)

    let shuttingDown = false
    swarm.on('connection', conn => {
      logger.info('Swarm opened connection')
      store.replicate(conn)
      conn.on('close', () => {
        if (shuttingDown) return
        logger.info('Swarm closed connection')
      })
    })

    goodbye(async () => {
      clearTimeout(errTimeout)
      clearInterval(checkInterval)
      shuttingDown = true
      logger.info('\nShutting down...')
      await swarm.destroy()
      await store.close()
    })

    logger.info('Swarming to get latest state...')
    swarm.join(keyColl.discoveryKey, { client: true, server: false })

    try {
      await promise
    } catch (e) {
      console.error(e.message)
      goodbye.exit()
      return
    }

    logger.info('Gossipping length updates...')
    await new Promise(resolve => setTimeout(resolve, 1000))

    logger.info('\nCollection:')
    for (const [key, { name }] of await keyColl.toMap()) {
      logger.info(`${key} -> ${name}`)
    }

    goodbye.exit()
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

const cmd = command('key-collection', sync, list)
cmd.parse()
