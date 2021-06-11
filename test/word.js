const officegen = require('officegen')

var fs = require('fs')
var path = require('path')

var docx = officegen('docx')

var outDir = path.join(__dirname, './')

docx.on('finalize', function (written) {
    console.log(
        'Finish to create Word file.\nTotal bytes created: ' + written + '\n'
    )
})

docx.on('error', function (err) {
    console.log(err)
})

var table = [
    [
        {
            val: 'Column',
            opts: {
                cellColWidth: 4261,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },
        {
            val: 'Type',
            opts: {
                cellColWidth: 4261,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },
        {
            val: 'Comment',
            opts: {
                cellColWidth: 4261,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },
        {
            val: 'Primary Key',
            opts: {
                cellColWidth: 4261,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },

        {
            val: 'Nullable',
            opts: {
                cellColWidth: 4261,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },
        {
            val: 'Default',
            opts: {
                cellColWidth: 4261,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },
    ],
    ['name', 'int', 'true', 'true', '0', 'username'],
]

var tableStyle = {
    tableColWidth: 4261,
    sz: 15,
    align: 'center',
    // tableSize: 24,
    // tableColor: 'ada',
    tableAlign: 'left',
    tableFontFamily: 'Microsoft YaHei'
}

var data = [
    {
        type: 'text',
        val: 'stock'
    },
    {
        type: 'table',
        val: table,
        opt: tableStyle
    },
    {
        type: 'linebreak'
    }, {
        type: 'linebreak'
    }
]

docx.createByJson(data)

var out = fs.createWriteStream(path.join(outDir, 'example_json.docx'))

out.on('error', function (err) {
    console.log(err)
})

docx.generate(out)