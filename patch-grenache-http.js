const fs = require('fs');
const path = require('path');

// Path to the TransportRPCClient.js file in node_modules
const transportPath = path.join(
    process.cwd(),
    'node_modules/grenache-nodejs-http/lib/TransportRPCClient.js'
);

console.log(`Looking for file: ${transportPath}`);

if (!fs.existsSync(transportPath)) {
    console.error(`Error: Could not find ${transportPath}`);
    process.exit(1);
}

// Read the current content
let originalContent = fs.readFileSync(transportPath, 'utf8');
console.log(`Successfully read ${transportPath}, size: ${originalContent.length} bytes`);

// Make a backup of the original file
fs.writeFileSync(`${transportPath}.bak`, originalContent);
console.log(`Created backup at ${transportPath}.bak`);

// Create a completely new version of the file with our Docker improvements
// This is safer than using regex replacements which might cause issues
const newContent = `'use strict'

const request = require('request')
const assert = require('assert')
const zlib = require('zlib')

const _ = require('lodash')
const Base = require('grenache-nodejs-base')

class TransportRPCClient extends Base.TransportRPCClient {
  constructor (client, conf) {
    super(client, conf)

    this.conf = conf
    
    // Increase default timeout for Docker environment
    if (process.env.USE_CONTAINER_NAMES === 'true' && (!this.conf.timeout || this.conf.timeout < 30000)) {
      console.log('[Grenache] Increasing default timeout for Docker environment');
      this.conf.timeout = 30000;
    }
    this.init()
  }

  init () {
    super.init()

    this.socket = this.getSocket(this.conf.secure)
  }

  getSocket (secure) {
    if (!secure) {
      return request
    }

    assert(Buffer.isBuffer(secure.key), 'conf.secure.key must be a Buffer')
    assert(Buffer.isBuffer(secure.cert), 'conf.secure.cert must be a Buffer')
    assert(Buffer.isBuffer(secure.ca), 'conf.secure.ca must be a Buffer')

    return request
  }

  getOpts (opts, secure) {
    // Apply container name resolution for Docker networking
    if (process.env.USE_CONTAINER_NAMES === 'true' && this.conf.dest && this.conf.dest.includes(':')) {
      try {
        const [ip, port] = this.conf.dest.split(':');
        // Try to resolve container name from IP using environment mapping
        let hostname = ip;
        
        // Check if we have container mappings defined
        if (process.env.CONTAINER_IP_MAP) {
          const containerMap = JSON.parse(process.env.CONTAINER_IP_MAP);
          if (containerMap[ip]) {
            hostname = containerMap[ip];
            if (process.env.DEBUG_GRENACHE === 'true') {
              console.log(\`[Grenache] Mapped IP \${ip} to container name \${hostname}\`);
            }
          }
        }
        
        // Replace IP with container name
        this.conf.dest = \`\${hostname}:\${port}\`;
        if (process.env.DEBUG_GRENACHE === 'true') {
          console.log(\`[Grenache] Using container-friendly destination: \${this.conf.dest} (original IP: \${ip}:\${port})\`);
        }
      } catch (err) {
        console.error('[Grenache] Error in container name resolution:', err.message);
      }
    }

    const u = secure
      ? ('https://' + this.conf.dest) : ('http://' + this.conf.dest)

    const def = {
      url: u,
      path: '/',
      method: 'POST'
    }

    if (!secure) {
      return _.extend(def, opts)
    }

    return _.extend(def, opts, secure)
  }

  request (key, payload, opts, cb) {
    this._request(key, payload, opts, cb)
  }

  async sendRequest (req) {
    let postData = this.format([req.rid, req.key, req.payload])
    const isCompress = req.opts.compress

    if (isCompress) {
      try {
        postData = await (new Promise((resolve, reject) => {
          zlib.gzip(postData, (err, res) => {
            if (err) {
              return reject(err)
            }

            resolve(res)
          })
        }))
      } catch (e) {
        this.handleReply(
          req.rid,
          new Error('ERR_REQUEST_ENCODING_COMPRESSION')
        )
      }
    }

    this.post({
      timeout: req.opts.timeout,
      body: postData,
      headers: {
        'grc-compress': isCompress ? 'gzip' : 'none'
      },
      encoding: null
    }, async (err, body) => {
      if (err) {
        this.handleReply(req.rid, new Error(\`ERR_REQUEST_GENERIC: \${err.message}\`))
        if (process.env.DEBUG_GRENACHE === 'true') {
          console.warn(\`[Grenache] Request error to \${this.conf.dest}: \${err.message}\`);
        }
        return
      }

      if (isCompress) {
        try {
          body = await new Promise((resolve, reject) => {
            zlib.gunzip(body, (err, res) => {
              if (err) {
                return reject(err)
              }

              resolve(res)
            })
          })
        } catch (e) {
          this.handleReply(
            req.rid,
            new Error('ERR_REPLY_ENCODING_COMPRESSION')
          )
          return
        }
      }

      const data = this.parse(body)

      if (!data) {
        this.handleReply(req.rid, new Error('ERR_REPLY_EMPTY'))
        return
      }

      const [rid, _err, res] = data
      this.handleReply(rid, _err ? new Error(_err) : null, res)
    })
  }

  post (_opts, _cb) {
    const socket = this.socket
    const opts = this.getOpts(_opts, this.conf.secure)

    let isExecuted = false

    const cb = (err, body) => {
      if (isExecuted) return
      isExecuted = true
      _cb(err, body)
    }

    const req = socket.post(opts, (err, res, body) => {
      if (err) {
        return cb(err)
      }

      cb(null, body)
    })

    req.on('error', (err) => {
      // Enhanced Docker error logging
      if (err && err.code === 'ECONNREFUSED' && process.env.DEBUG_GRENACHE === 'true') {
        console.warn(\`[Grenache] Connection refused to \${_opts.url || this.conf.dest}, this may be a Docker networking issue\`);
      }
      cb(err)
    })
  }

  requestStream (key, opts) {
    return this._requestStream(key, opts)
  }

  sendRequestStream (req) {
    const addHeaders = {}
    const _h = req.opts.headers || {}
    Object.keys(_h).forEach((k) => {
      if (typeof _h[k] === 'string') {
        addHeaders[k] = _h[k]
        return
      }
      addHeaders[k] = JSON.stringify(_h[k])
    })

    const _opts = {
      headers: {
        _gr: this.format([req.rid, req.key]),
        ...addHeaders
      },
      timeout: req.opts.timeout
    }

    const opts = this.getOpts(_opts, this.conf.secure)
    const stream = this.socket.post(opts)
    return stream
  }
}

module.exports = TransportRPCClient
`;

// Write the new content to the file
fs.writeFileSync(transportPath, newContent);
console.log(`Successfully patched ${transportPath} for improved Docker container networking`);
console.log('To enable the patch, set the following environment variables in your Docker environment:');
console.log('  - USE_CONTAINER_NAMES=true');
console.log('  - CONTAINER_IP_MAP={"172.18.0.2":"exchange-node1","172.18.0.3":"exchange-node2"} (adjust IPs and container names)');
console.log('  - DEBUG_GRENACHE=true (optional, for additional logging)');