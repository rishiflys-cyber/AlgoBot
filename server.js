
require('dotenv').config();
const express=require('express');
const fs=require('fs');
const KiteConnect=require("kiteconnect").KiteConnect;

const app=express();
const PORT=process.env.PORT||3000;

// ===== CONFIG =====
const HISTORICAL_FILE="historical_data.json";
const RESULT_FILE="backtest_results.json";

// ===== LOAD HISTORICAL DATA =====
let historical=[];
if(fs.existsSync(HISTORICAL_FILE)){
 try{
  historical=JSON.parse(fs.readFileSync(HISTORICAL_FILE));
 }catch{}
}

// ===== STRATEGY PARAMETERS (TO OPTIMIZE) =====
let params={
 momentumThreshold:1,
 sl:0.005,
 target:0.02
};

// ===== BACKTEST ENGINE =====
function runBacktest(data, p){

 let trades=[];
 let position=null;

 for(let i=1;i<data.length;i++){

  const prev=data[i-1];
  const curr=data[i];

  // entry condition (momentum)
  if(!position && curr.close > prev.close * (1+p.momentumThreshold*0.001)){
   position={
    entry:curr.close,
    time:curr.time
   };
  }

  // exit condition
  if(position){
   const change=(curr.close-position.entry)/position.entry;

   if(change >= p.target || change <= -p.sl){
    trades.push({
     entry:position.entry,
     exit:curr.close,
     pnl:change
    });
    position=null;
   }
  }
 }

 // metrics
 const wins=trades.filter(t=>t.pnl>0);
 const losses=trades.filter(t=>t.pnl<=0);

 const winRate=wins.length/(trades.length||1);
 const avgWin=wins.length?wins.reduce((a,b)=>a+b.pnl,0)/wins.length:0;
 const avgLoss=losses.length?losses.reduce((a,b)=>a+b.pnl,0)/losses.length:0;

 const expectancy=(winRate*avgWin)+((1-winRate)*avgLoss);

 return {trades:trades.length, winRate, expectancy};
}

// ===== OPTIMIZER =====
function optimize(data){

 let best={expectancy:-999};

 for(let m=1;m<=5;m++){
  for(let sl=0.003;sl<=0.01;sl+=0.002){
   for(let t=0.01;t<=0.03;t+=0.005){

    const result=runBacktest(data,{
     momentumThreshold:m,
     sl:sl,
     target:t
    });

    if(result.expectancy > best.expectancy){
     best={
      params:{m,sl,t},
      result
     };
    }
   }
  }
 }

 fs.writeFileSync(RESULT_FILE,JSON.stringify(best,null,2));
 return best;
}

// ===== ROUTES =====

app.get('/',(req,res)=>{
 res.json({status:"engine ready"});
});

app.get('/run-backtest',(req,res)=>{
 if(!historical.length) return res.json({error:"no data"});
 const result=runBacktest(historical,params);
 res.json(result);
});

app.get('/optimize',(req,res)=>{
 if(!historical.length) return res.json({error:"no data"});
 const best=optimize(historical);
 res.json(best);
});

app.listen(PORT,()=>console.log("V20 BACKTEST + OPTIMIZER RUNNING"));
