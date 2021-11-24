const { readFileSync } = require('fs');
var {Client} = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
}).connect({
  host: '127.0.0.1',
  port: 22,
  username: 'cweijan@163.com',
  privateKey: readFileSync('C:\\Users\\cweij\\.ssh\\id_rsa')
});