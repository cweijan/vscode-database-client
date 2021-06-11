export class DumpDocument {

    public static tableStyle = {
        tableColWidth: 4261,
        sz: 15,
        align: 'center',
        // tableSize: 24,
        // tableColor: 'ada',
        tableAlign: 'left',
        tableFontFamily: 'Microsoft YaHei'
    }

    public static header = [
        {
            val: 'Column',
            opts: {
                cellColWidth: 20,
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
                cellColWidth: 20,
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
                cellColWidth: 20,
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
                cellColWidth: 30,
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
                cellColWidth: 20,
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
                cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '50'
                }
            }
        },
    ];

}