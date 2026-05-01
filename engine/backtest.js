exports.runBacktest = function(){

    const data = [100,102,105,103,108,110];
    let profit = 0;

    for(let i=1;i<data.length;i++){
        if(data[i] > data[i-1]) profit += data[i]-data[i-1];
    }

    return {profit};
};
