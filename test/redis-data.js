const Redis = require("ioredis");

(async () => {
    let redis = new Redis({
        port: 6379,
        host: "127.0.0.1",
    });


    for (let i = 0; i < 250000; i++) {
        redis.hset("test_hset", i, i)
    }

})()