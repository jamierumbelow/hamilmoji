/**
 * hamilmoji - a hamilton / emoji search engine
 */

require('dotenv').config()

const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const slugify = require('slugify')
const LyricistFactory = require('lyricist')
const algoliasearch = require('algoliasearch')

const lyricist = new LyricistFactory(process.env.GENIUS_ACCESS_TOKEN)
const algolia = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_SECRET)
const index = algolia.initIndex(process.env.ALGOLIA_INDEX)

const ALBUM_ID = '131575'
const DATA_DIR = path.resolve('./data')
const LYRICS_FILE_NAME = path.join(DATA_DIR, 'hamilton-lyrics.json')

/**
 * main function
 */

function main() {
  if (command === 'setup') {
    return getLyrics()
      .then(setupEmoji)
      .then(indexLyrics)
  } else if (command === 'get-lyrics') {
    return getLyrics()
  } else if (command === 'index') {
    return indexLyrics()
  } else if (command === 'setup-emoji') {
    return setupEmoji()
  }

  console.log('hamilmoji setup script\n')
  console.log('Usage: yarn [command]')
  console.log('Commands:')
  console.log("\tsetup\t\tsetup everything in one go")
  console.log("\tget-lyrics\tget the hamilton lyrics")
  console.log("\tindex\t\tindex the lyrics")
  console.log("\tsetup-emoji\tsetup emoji synonyms")
}

async function getLyrics() {
  const album = await lyricist.album(ALBUM_ID, { fetchTracklist: true })
  const songPromises = _.map(album.tracklist, async (song) => await lyricist.song(song.id, { fetchLyrics: true }))
  const songs = _.map(await Promise.all(songPromises), fetchSongJson)

  if (fs.existsSync(LYRICS_FILE_NAME)) {
    fs.unlinkSync(LYRICS_FILE_NAME)
  }
  fs.writeFileSync(LYRICS_FILE_NAME, JSON.stringify(songs))

  return console.log(`Successfully fetched lyrics and written to ${LYRICS_FILE_NAME}`)
}

async function setupEmoji() {
  const emoji = require('emoji.json')

  const allSynonyms = _.map(emoji, (emojo) => {
    const synonyms = _.map(emojo.keywords.split('|'), (word) => word.trim())
    synonyms.push(emojo.char)

    return {
      objectID: emojo.codes,
      type: 'synonym',
      synonyms
    }
  })

  index.batchSynonyms(allSynonyms, { replaceExistingSynonyms: true }, (err, res) => {
    if (err) throw err
    index.waitTask(res.taskID, (err) => {
      console.log('Successfully cleared synonyms and set up emojis.')
    })
  })
}

async function indexLyrics() {
  if (!fs.existsSync(LYRICS_FILE_NAME)) {
    return console.error('ERROR: Please run get-lyrics first!')
  }

  index.clearIndex((err, res) => {
    if (err) throw err
    index.waitTask(res.taskID, (err) => {
      const songs = require(LYRICS_FILE_NAME)
      index.addObjects(songs, (err, res) => {
        if (err) throw err
        index.waitTask(res.taskID, (err) => {
          console.log('Successfully cleared index and indexed new lyrics.')
        })
      })
    })
  })
}

/**
 * helpers
 */

const fetchSongJson = ({ id, title, lyrics }) => ({
  genius_id: id,
  title,
  lyrics
})

/**
 * run
 */

process.argv.shift()
process.argv.shift()

const command = _.get(process.argv, 0, 'help')

main(command)
