import chalk from 'chalk'
import prompt from 'prompt-sync'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Keyv from 'keyv'
import { KeyvFile } from 'keyv-file'

// Commander
import { Command } from 'commander'
const program = new Command()

program
	.name('node index')
	.description('Show Plex "Now Playing" session in VRChat status')
	.option('-t, --token <X-Plex-Token>', 'Set Plex server token')
	.option('-a, --address <Plex server IP / address & port>', 'Set Plex server address, including protocol and port (Example: http://127.0.0.1:32400)')
	.option('-s, --short', 'Enable "short" mode. Disables subtitle from appearing for tracks.')
	.option('-p, --polling-rate <Polling rate in milliseconds>', 'Set polling rate for contacting Plex API in milliseconds (Default: 500ms)')
	.option('--reset-plex', 'Reset Plex authentication and re-authorize')
	.option('--reset-vrchat', 'Reset VRChat session and re-login')
	.option('--reset-all', 'Reset all saved credentials and sessions')
	.helpOption('-h, --help', 'Show help information')
	.parse()

const options = program.opts()

// Paths setup
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionFilePath = path.join(__dirname, 'vrchat-session.json')
const configPath = path.join(__dirname, 'config.json')
const pendingRestorePath = path.join(__dirname, '.pending-restore.json')

// Pending restore management - saves state in case app is killed
function savePendingRestore(status) {
	try {
		fs.writeFileSync(pendingRestorePath, JSON.stringify({ status, timestamp: Date.now() }))
	} catch (e) { /* ignore */ }
}

function clearPendingRestore() {
	try {
		if (fs.existsSync(pendingRestorePath)) {
			fs.unlinkSync(pendingRestorePath)
		}
	} catch (e) { /* ignore */ }
}

function loadPendingRestore() {
	try {
		if (fs.existsSync(pendingRestorePath)) {
			const data = JSON.parse(fs.readFileSync(pendingRestorePath, 'utf-8'))
			// Only use if less than 24 hours old
			if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
				return data.status
			}
			clearPendingRestore()
		}
	} catch (e) { /* ignore */ }
	return null
}

// Prompter setup
const prompter = prompt({ sigint: true })

// Config management
function loadConfig() {
	try {
		if (fs.existsSync(configPath)) {
			return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
		}
	} catch (error) {
		console.log(chalk.yellow('Warning: Could not load config file, starting fresh.'))
	}
	return {}
}

function saveConfig(config) {
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

let config = loadConfig()

// Handle reset options
if (options.resetAll) {
	config = {}
	saveConfig(config)
	if (fs.existsSync(sessionFilePath)) {
		fs.unlinkSync(sessionFilePath)
	}
	console.log(chalk.green('All credentials and sessions have been reset.'))
}

if (options.resetPlex) {
	delete config.plexToken
	delete config.plexServerAddress
	saveConfig(config)
	console.log(chalk.green('Plex credentials have been reset.'))
}

if (options.resetVrchat) {
	if (fs.existsSync(sessionFilePath)) {
		fs.unlinkSync(sessionFilePath)
	}
	console.log(chalk.green('VRChat session has been reset.'))
}

// ============================================
// Plex Authentication
// ============================================

const PLEX_CLIENT_ID = 'vrchat-plex-status-' + (config.plexClientId || generateClientId())
const PLEX_PRODUCT = 'VRChat Plex Status'
const PLEX_DEVICE = 'PC'

function generateClientId() {
	const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
	config.plexClientId = id
	saveConfig(config)
	return id
}

async function plexPinAuth() {
	console.log(chalk.cyan('\n=== Plex Authorization ==='))
	console.log('Requesting authorization PIN from Plex...')

	// Request a PIN
	const pinResponse = await fetch('https://plex.tv/api/v2/pins', {
		method: 'POST',
		headers: {
			'Accept': 'application/json',
			'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
			'X-Plex-Product': PLEX_PRODUCT,
			'X-Plex-Device': PLEX_DEVICE,
		},
		body: new URLSearchParams({ strong: 'true' })
	})

	if (!pinResponse.ok) {
		throw new Error(`Failed to get PIN: ${pinResponse.statusText}`)
	}

	const pinData = await pinResponse.json()
	const pinId = pinData.id
	const pinCode = pinData.code

	const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pinCode}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PLEX_PRODUCT)}`

	console.log(chalk.yellow('\nPlease authorize this app by visiting:'))
	console.log(chalk.blue.underline(authUrl))
	console.log(chalk.gray('\nWaiting for authorization... (Press Ctrl+C to cancel)'))

	// Try to open the browser automatically
	try {
		const { default: open } = await import('open')
		await open(authUrl)
		console.log(chalk.gray('(Browser opened automatically)'))
	} catch {
		console.log(chalk.gray('(Could not open browser automatically, please open the link manually)'))
	}

	// Poll for authorization
	const maxAttempts = 120 // 2 minutes at 1 second intervals
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		await new Promise(resolve => setTimeout(resolve, 1000))

		const checkResponse = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
			headers: {
				'Accept': 'application/json',
				'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
			}
		})

		if (checkResponse.ok) {
			const checkData = await checkResponse.json()
			if (checkData.authToken) {
				console.log(chalk.green('\nAuthorization successful!'))
				return checkData.authToken
			}
		}

		// Show progress dot every 5 seconds
		if (attempt % 5 === 0 && attempt > 0) {
			process.stdout.write('.')
		}
	}

	throw new Error('Authorization timed out. Please try again.')
}

async function getPlexServers(token) {
	const response = await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=0', {
		headers: {
			'Accept': 'application/json',
			'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
			'X-Plex-Token': token,
		}
	})

	if (!response.ok) {
		throw new Error(`Failed to get servers: ${response.statusText}`)
	}

	const resources = await response.json()
	return resources.filter(r => r.provides === 'server')
}

function getBestConnection(server) {
	const connections = server.connections || []

	// Prefer local HTTP connections (most reliable for local networks)
	// plex.direct URLs use HTTPS which can have SSL issues
	const localHttp = connections.find(c => c.local && !c.relay && c.uri.startsWith('http://'))
	if (localHttp) return localHttp

	// Then try any local connection
	const localConnection = connections.find(c => c.local && !c.relay)
	if (localConnection) return localConnection

	// Then try non-relay remote
	const remoteConnection = connections.find(c => !c.relay)
	if (remoteConnection) return remoteConnection

	return connections[0]
}

async function selectPlexServer(token) {
	const servers = await getPlexServers(token)

	if (servers.length === 0) {
		console.log(chalk.yellow('\nNo Plex servers found on your account.'))
		console.log('Please enter your Plex server address manually.')
		const address = prompter('Server address (e.g., http://192.168.1.100:32400): ')
		if (!address) {
			throw new Error('No server address provided')
		}
		return address
	}

	// Auto-select if only one server
	if (servers.length === 1) {
		const server = servers[0]
		console.log(chalk.green(`\nFound server: ${server.name}`))

		// Show available connections for debugging
		const connections = server.connections || []
		if (connections.length > 0) {
			console.log(chalk.gray('Available connections:'))
			connections.forEach(c => {
				const flags = []
				if (c.local) flags.push('local')
				if (c.relay) flags.push('relay')
				console.log(chalk.gray(`  - ${c.uri} [${flags.join(', ') || 'remote'}]`))
			})
		}

		const connection = getBestConnection(server)
		if (connection) {
			console.log(chalk.cyan(`Selected: ${connection.uri}`))
			return connection.uri
		}
	}

	// Multiple servers - let user choose
	console.log(chalk.cyan('\n=== Select Plex Server ==='))
	servers.forEach((server, index) => {
		const owned = server.owned ? chalk.green(' (owned)') : ''
		console.log(`${index + 1}. ${server.name}${owned}`)
	})
	console.log(`${servers.length + 1}. Enter address manually`)

	const choice = prompter(`Select server (1-${servers.length + 1}): `)
	const choiceNum = parseInt(choice)

	if (choiceNum === servers.length + 1) {
		const address = prompter('Server address (e.g., http://192.168.1.100:32400): ')
		if (!address) {
			throw new Error('No server address provided')
		}
		return address
	}

	if (choiceNum < 1 || choiceNum > servers.length) {
		throw new Error('Invalid selection')
	}

	const selectedServer = servers[choiceNum - 1]
	const connection = getBestConnection(selectedServer)

	if (!connection) {
		throw new Error('No valid connection found for this server')
	}

	return connection.uri
}

async function setupPlex() {
	// Check command line overrides first
	if (options.token && options.address) {
		return { token: options.token, address: options.address }
	}

	// Check saved config
	if (config.plexToken && config.plexServerAddress && !options.token && !options.address) {
		console.log(chalk.gray('Using saved Plex credentials...'))
		return { token: config.plexToken, address: config.plexServerAddress }
	}

	// Need to authenticate
	const token = options.token || config.plexToken || await plexPinAuth()

	// Save token
	if (!config.plexToken) {
		config.plexToken = token
		saveConfig(config)
	}

	// Get server address
	const address = options.address || config.plexServerAddress || await selectPlexServer(token)

	// Save address
	if (!config.plexServerAddress) {
		config.plexServerAddress = address
		saveConfig(config)
	}

	return { token, address }
}

// ============================================
// VRChat Authentication
// ============================================

const keyvStore = new Keyv({
	store: new KeyvFile({ filename: sessionFilePath }),
	namespace: 'vrchat'
})

import { VRChat } from 'vrchat'
const vrchatAPI = new VRChat({
	application: {
		name: 'plex-osc',
		version: '1.0.0',
		contact: 'plex-osc@localhost'
	},
	keyv: keyvStore
})

let currentUserId = null
let originalStatus = ''

async function setupVRChat() {
	console.log(chalk.cyan('\n=== VRChat Authentication ==='))
	console.log('Connecting to VRChat...')

	// First, check if we already have a valid session
	let needsLogin = true
	try {
		const userResult = await vrchatAPI.getCurrentUser()
		if (userResult.data && userResult.data.id) {
			currentUserId = userResult.data.id
			originalStatus = userResult.data.statusDescription || ''
			console.log(chalk.green(`Session restored: ${userResult.data.displayName}`))
			console.log(chalk.gray(`Original status: "${originalStatus}"`))
			needsLogin = false
		}
	} catch (error) {
		// Session invalid or expired, need to login
	}

	// Only login if we don't have a valid session
	if (needsLogin) {
		console.log('No valid session found. Please log in.')
		console.log(chalk.yellow('\nNote: VRChat does not support web-based login for third-party apps.'))
		console.log(chalk.yellow('Your credentials are only sent to VRChat and stored locally.\n'))

		const username = prompter('VRChat Username/Email: ')
		if (!username) {
			throw new Error('No username provided')
		}

		const password = prompter.hide('VRChat Password: ')
		if (!password) {
			throw new Error('No password provided')
		}

		try {
			const loginResult = await vrchatAPI.login({
				username,
				password,
				twoFactorCode: () => prompter('Enter your VRChat 2FA code: ')
			})

			if (loginResult.error) {
				throw new Error(loginResult.error.message || 'Login failed')
			}

			currentUserId = loginResult.data.id
			originalStatus = loginResult.data.statusDescription || ''
			console.log(chalk.green(`\nLogged in as: ${loginResult.data.displayName}`))
			console.log(chalk.gray(`Original status: "${originalStatus}"`))
		} catch (error) {
			throw new Error(`Failed to login to VRChat: ${error.message}`)
		}
	}

	// Check if we need to restore status from a previous crashed session
	const pendingStatus = loadPendingRestore()
	if (pendingStatus !== null) {
		console.log(chalk.yellow('Detected unclean shutdown, restoring previous status...'))
		try {
			await vrchatAPI.updateUser({
				path: { userId: currentUserId },
				body: { statusDescription: pendingStatus }
			})
			originalStatus = pendingStatus
			console.log(chalk.green(`Restored to: "${pendingStatus}"`))
			clearPendingRestore()
		} catch (error) {
			console.log(chalk.red('Failed to restore previous status'))
		}
	}
}

// ============================================
// Status Management
// ============================================

async function restoreStatus() {
	console.log(chalk.yellow('\nRestoring original status...'))
	try {
		await vrchatAPI.updateUser({
			path: { userId: currentUserId },
			body: { statusDescription: originalStatus }
		})
		console.log(chalk.green(`Status restored to: "${originalStatus}"`))
		clearPendingRestore()
	} catch (error) {
		console.error(chalk.red(`Failed to restore status: ${error.message}`))
	}
}

let isShuttingDown = false

async function cleanup() {
	if (isShuttingDown) return
	isShuttingDown = true

	console.log('\nShutting down...')
	await restoreStatus()
	process.exit(0)
}

// Handle all termination signals
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('SIGHUP', cleanup)

// Handle Windows-specific close events
process.on('exit', () => {
	if (!isShuttingDown && currentUserId) {
		// Synchronous last-ditch attempt - won't always work but worth trying
		console.log('Restoring status on exit...')
	}
})

// For Windows console close
if (process.platform === 'win32') {
	process.on('message', (msg) => {
		if (msg === 'shutdown') {
			cleanup()
		}
	})
}

process.on('uncaughtException', async (err) => {
	console.error('Error:', err.message)
	await cleanup()
})

process.on('unhandledRejection', async () => {
	await cleanup()
})

// ============================================
// Main Application
// ============================================

async function testPlexConnection(plexAPI, address) {
	console.log(chalk.gray(`Testing connection to ${address}...`))
	try {
		await plexAPI.server.getServerCapabilities()
		console.log(chalk.green('Plex server connection successful!'))
		return true
	} catch (error) {
		console.error(chalk.red('\nFailed to connect to Plex server.'))
		console.error(chalk.yellow('Error:'), error.message)

		if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('certificate')) {
			console.log(chalk.cyan('\nThis often happens with plex.direct HTTPS URLs.'))
			console.log(chalk.cyan('Try entering your local server address instead.\n'))
		}
		return false
	}
}

async function promptForManualAddress() {
	console.log(chalk.yellow('\nEnter your Plex server address manually.'))
	console.log(chalk.gray('Tip: Use HTTP for local servers (e.g., http://192.168.1.100:32400)'))
	console.log(chalk.gray('Find your IP in Plex Settings > Network > LAN Networks\n'))

	const address = prompter('Server address: ')
	return address || null
}

async function main() {
	console.log(chalk.cyan.bold('\n VRChat Plex Status Monitor \n'))

	// Setup Plex
	let { token: plexToken, address: plexAddress } = await setupPlex()

	// Initialize Plex API
	const { PlexAPI } = await import('@lukehagar/plexjs')
	let plexAPI = new PlexAPI({
		serverURL: plexAddress,
		accessToken: plexToken,
	})

	// Test Plex connection before continuing
	let plexConnected = await testPlexConnection(plexAPI, plexAddress)

	// If connection failed, offer manual address entry
	while (!plexConnected) {
		const manualAddress = await promptForManualAddress()
		if (!manualAddress) {
			console.log(chalk.red('No address provided. Exiting.'))
			process.exit(1)
		}

		plexAddress = manualAddress
		plexAPI = new PlexAPI({
			serverURL: plexAddress,
			accessToken: plexToken,
		})

		plexConnected = await testPlexConnection(plexAPI, plexAddress)

		if (plexConnected) {
			// Save the working address
			config.plexServerAddress = plexAddress
			saveConfig(config)
			console.log(chalk.gray('Server address saved for future use.'))
		}
	}

	// Setup VRChat
	await setupVRChat()

	const pollingRateMs = parseInt(options.pollingRate) || 500
	let lastOSCMessage = ''
	let statusCheckCounter = 0
	const statusCheckInterval = 20 // Check user status every ~10 seconds (20 * 500ms)

	console.log(chalk.green('\nReady! Monitoring Plex sessions... (Ctrl+C to exit)\n'))

	async function getPlexSessions() {
		try {
			const sessions = await plexAPI.sessions.getSessions()

			// Find the first admin session
			const adminSession = sessions.object.mediaContainer.metadata?.find(
				session => session.user.id === '1'
			)

			if (adminSession) {
				let title = adminSession.title
				let subtitle = `${adminSession.grandparentTitle} | ${adminSession.parentTitle}`
				if (options.short)
					subtitle = `${adminSession.grandparentTitle} `

				switch (adminSession.type) {
					case 'track':
						if (adminSession.title === adminSession.parentTitle)
							subtitle = `${adminSession.grandparentTitle} `
						break
					case 'movie':
						subtitle = ''
						break
					case 'episode':
						title = adminSession.grandparentTitle
						subtitle = `S${adminSession.parentIndex}E${adminSession.index}`
						if (adminSession.parentIndex === 0)
							subtitle = `Special Episode ${adminSession.index}`
						break
				}

				let statusMessage = subtitle ? `${title} ${subtitle}`.trim() : title

				// Only update VRChat status when the message content changes
				if (lastOSCMessage !== statusMessage) {
					try {
						const result = await vrchatAPI.updateUser({
							path: { userId: currentUserId },
							body: { statusDescription: statusMessage }
						})

						if (result.error) {
							console.error(chalk.red('API error:'), result.error.message || result.error)
						} else {
							console.log(chalk.green('Status:'), statusMessage)
							lastOSCMessage = statusMessage
							// Save original status in case app is killed
							savePendingRestore(originalStatus)
						}
					} catch (error) {
						console.error(chalk.red('Error updating status:'), error.message)
					}
				}
			}

			// Playback stopped / no playback - restore original status
			if (!adminSession && lastOSCMessage !== '') {
				try {
					const result = await vrchatAPI.updateUser({
						path: { userId: currentUserId },
						body: { statusDescription: originalStatus }
					})
					if (result.error) {
						console.error(chalk.red('API error:'), result.error.message || result.error)
					} else {
						console.log(chalk.yellow('Restored:'), `"${originalStatus}"`)
						lastOSCMessage = ''
						clearPendingRestore()
					}
				} catch (error) {
					console.error(chalk.red('Error restoring status:'), error.message)
				}
			}

			// Periodically check if user changed their status while no playback is active
			if (!adminSession && lastOSCMessage === '') {
				statusCheckCounter++
				if (statusCheckCounter >= statusCheckInterval) {
					statusCheckCounter = 0
					try {
						const userResult = await vrchatAPI.getCurrentUser()
						if (userResult.data && userResult.data.statusDescription !== undefined) {
							const currentStatus = userResult.data.statusDescription || ''
							if (currentStatus !== originalStatus) {
								originalStatus = currentStatus
								console.log(chalk.cyan('Status updated:'), `"${originalStatus}"`)
							}
						}
					} catch (error) {
						// Silently ignore - not critical
					}
				}
			}
		} catch (error) {
			// Silently handle common connection errors during polling
			const ignoredErrors = ['ECONNREFUSED', 'fetch failed', 'ETIMEDOUT', 'ENOTFOUND']
			const shouldIgnore = ignoredErrors.some(e => error.message.includes(e))
			if (!shouldIgnore) {
				console.error(chalk.red('Plex error:'), error.message)
			}
		}
	}

	setInterval(() => {
		getPlexSessions()
	}, pollingRateMs)
}

main().catch(error => {
	console.error(chalk.red('\nFatal error:'), error.message)
	process.exit(1)
})
