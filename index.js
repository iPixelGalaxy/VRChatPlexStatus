import 'dotenv/config'
import chalk from 'chalk'
import prompt from 'prompt-sync'
import path from 'path'
import { fileURLToPath } from 'url'
import Keyv from 'keyv'
import KeyvSqlite from '@keyv/sqlite'

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
	.helpOption('-h, --help', 'Show help information')
	.parse()

const options = program.opts()

// Session persistence setup
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionDbPath = path.join(__dirname, 'vrchat-session.sqlite')
const keyvStore = new Keyv({
	store: new KeyvSqlite(`sqlite://${sessionDbPath}`),
	namespace: 'vrchat'
})

// VRChat API with session persistence
import { VRChat } from 'vrchat'
const vrchatAPI = new VRChat({
	application: {
		name: 'plex-osc',
		version: '1.0.0',
		contact: 'plex-osc@localhost'
	},
	keyv: keyvStore
})

// Login to VRChat
console.log('Connecting to VRChat...')
const prompter = prompt({ sigint: true })

let currentUserId = null
let originalStatus = ''

// First, check if we already have a valid session
let needsLogin = true
try {
	const userResult = await vrchatAPI.getCurrentUser()
	if (userResult.data && userResult.data.id) {
		currentUserId = userResult.data.id
		originalStatus = userResult.data.statusDescription || ''
		console.log(`✅ Session restored: ${userResult.data.displayName}`)
		console.log(`Original status: "${originalStatus}"`)
		needsLogin = false
	}
} catch (error) {
	// Session invalid or expired, need to login
}

// Only login if we don't have a valid session
if (needsLogin) {
	console.log('No valid session, logging in...')
	try {
		const loginResult = await vrchatAPI.login({
			username: process.env.VRCHAT_USERNAME,
			password: process.env.VRCHAT_PASSWORD,
			twoFactorCode: () => prompter('Enter your VRChat 2FA code: ')
		})

		if (loginResult.error) {
			console.error('❌ Failed to login to VRChat:')
			console.error(loginResult.error)
			process.exit(1)
		}

		currentUserId = loginResult.data.id
		originalStatus = loginResult.data.statusDescription || ''
		console.log(`✅ Logged in as: ${loginResult.data.displayName}`)
		console.log(`Original status: "${originalStatus}"`)
	} catch (error) {
		console.error('❌ Failed to login to VRChat:')
		console.error(error.message)
		process.exit(1)
	}
}

// Restore original status on exit
async function restoreStatus() {
	console.log(chalk`{yellow Restoring original status...}`)
	try {
		await vrchatAPI.updateUser({
			path: { userId: currentUserId },
			body: { statusDescription: originalStatus }
		})
		console.log(chalk`{green ✅ Status restored to: "${originalStatus}"}`)
	} catch (error) {
		console.error(chalk`{red ❌ Failed to restore status: ${error.message}}`)
	}
}

process.on('SIGINT', async () => {
	console.log('\nReceived SIGINT, cleaning up...')
	await restoreStatus()
	process.exit(0)
})

process.on('SIGTERM', async () => {
	console.log('\nReceived SIGTERM, cleaning up...')
	await restoreStatus()
	process.exit(0)
})

// Plex API
import { PlexAPI } from '@lukehagar/plexjs'
const plexAPI = new PlexAPI({
	serverURL: options.address || process.env.PLEX_SERVER_ADDRESS,
	accessToken: options.token || process.env.PLEX_TOKEN,
})

const pollingRateMs = parseInt(options.pollingRate) || 500
let lastOSCMessage = ''

console.log(chalk`{green Ready!} Monitoring Plex sessions... (Ctrl+C to exit)`)

async function getPlexSessions() {
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
					console.error(chalk`{red ❌ API error:}`, result.error.message || result.error)
				} else {
					console.log(chalk`{green ✅ Status:} ${statusMessage}`)
					lastOSCMessage = statusMessage
				}
			} catch (error) {
				console.error(chalk`{red ❌ Error updating status:}`, error.message)
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
				console.error(chalk`{red ❌ API error:}`, result.error.message || result.error)
			} else {
				console.log(chalk`{yellow 🔄 Restored:} "${originalStatus}"`)
				lastOSCMessage = ''
			}
		} catch (error) {
			console.error(chalk`{red ❌ Error restoring status:}`, error.message)
		}
	}
}

setInterval(() => {
	getPlexSessions()
}, pollingRateMs)
