const Redis = require("ioredis");

(async () => {
    let cluster = new Redis.Cluster([
        {
            port: 6380,
            host: "127.0.0.1",
        },
        // {
        //     port: 6381,
        //     host: "127.0.0.1",
        // },
        // {
        //     port: 6382,
        //     host: "127.0.0.1",
        // },
    ]);
    cluster=new Redis(6380)

    for (let i = 0; i < 15; i++) {
        cluster.set(i, i);
    }

    const masters = cluster.nodes("master");

    const keys=(await Promise.all(masters.map((master) => master.keys('*')))).flat();
    console.log(keys)

})()
