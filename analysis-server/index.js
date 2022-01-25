const { decrypt } = require("./des");
const express = require('express')
const app = express()
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require("mysql2")
const format = require('date-format');

const con = mysql.createConnection('mysql://root:root@127.0.0.1:3306/test')

app.use(cors()).use(bodyParser.text({ type: "*/*" })).post("/a", (req, res) => {
    const body = req.body;
    try {
        const dec = JSON.parse(decrypt(body))
        console.log(JSON.stringify(dec))
        con.query(`insert into user(create_time,ip,user_name,platform,version) values('${format('yyyy-MM-dd', new Date())}','${req.socket.remoteAddress}','${dec.u.replace(/'/g,'\'\'')}','${dec.p}','${dec.v}')`)
        res.json({ s: true })
    } catch (error) {
        console.log(error)
        res.json({})
    }

})

const port = 873;
app.listen(port)
console.log(`启动数据分析程序成功`)