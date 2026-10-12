// const logger = (req, res, next) => {
//     console.log(req.method, req.url);
//     next();
// }

// module.exports = logger;




const logger = (req, res, next) => {
    res.on('finish', () => {
        console.log(req.method, req.url, res.statusCode, new Date().toISOString(),);
    });

    next();
}

module.exports = logger;