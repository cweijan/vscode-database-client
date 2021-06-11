export class DumpDocument {

    public static tableStyle = {
        // tableColWidth: 4261,
        sz: 15,
        align: 'center',
        // tableSize: 24,
        // tableColor: 'ada',
        tableAlign: 'left',
        tableFontFamily: 'Microsoft YaHei',
        columns: [{ width: 20 }, { width: 20 }, { width: 20 },{ width: 40 },{ width: 20 },{ width: 20 }],
    }

    public static header = [
        {
            val: 'Column',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '40'
                }
            }
        },
        {
            val: 'Type',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '40'
                }
            }
        },
        {
            val: 'Comment',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '40'
                }
            }
        },
        {
            val: 'Primary Key',
            opts: {
                // cellColWidth: 40,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '40'
                }
            }
        },

        {
            val: 'Nullable',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '40'
                }
            }
        },
        {
            val: 'Default',
            opts: {
                // cellColWidth: 20,
                align: 'center',
                b: true,
                sz: 16,
                shd: {
                    themeFillTint: '40'
                }
            }
        },
    ];

}