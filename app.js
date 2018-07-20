let Web3 = require('web3'),
		web3,
		mongoose = require('mongoose'),
		AccountModel = require('./accountmodel.js'),
		infura_ropsten = "https://ropsten.infura.io",
		infura_live = 'https://mainnet.infura.io/v3/<your infura appid>';

if( typeof web3 !== 'undefined'){
	web3 = new Web3(web3.currentProvider);
}else{
	web3 = new Web3(new Web3.providers.HttpProvider(infura_live));
}
function toEth(res){
	if(typeof res == 'number')return (res/(10**18)).toFixed(8);
}
//add new account
function addNewAccount(newAddress){
	return new Promise((resolve,reject)=>{
		AccountModel.find({address:newAddress},(err,docs)=>{
			if(err) return console.log(err)
			//if newAddress is exists,then skip
			if(docs.length!=0){
				console.log('address:'+newAddress+' exists!');
				resolve();
			}else{
				//save newAddress to mongodb
				new AccountModel({
					address:newAddress
				}).save((err,doc)=>{
					if(err) return console.log('save failed.');
						console.log('AccountModel %s save succeed.',newAddress);
						resolve();
				});
			}
		})
	})
}
// check block to decide whether fetch or not.
function checkBlock(newBlock){
	return new Promise((resolve,reject)=>{
		AccountModel.find({$where:'this.block!=undefined'},(err,doc)=>{
			if(err) return console.log(err);
			if(doc.length==0){
				//if block not exists,then initial it to 0
				AccountModel.create({block:0},(err,doc)=>{
					console.log('initial block to 0.')
				})
				resolve({
					curBlock:0,
					canContinue:true
				})
			}else{
			resolve( {
				curBlock:doc[0].block,
				canContinue:newBlock>doc[0].block
			});
		}
	})
})
}
//update block everytime in mongodb
function updateBlock(newBlock){
	return new Promise((resolve,reject)=>{
		//update block
		AccountModel.update({$where:'this.block!=undefined'},{block:newBlock},(err,doc)=>{
			if(err) return console.log(err)
			console.log('updateBlock succeed: ',newBlock);
			resolve();
		})
	})
}

function checkBalance(addr){
	return new Promise((resolve,reject)=>{
		AccountModel.find({address:addr},(err,doc)=>{
			if(err){
				return console.log(err)
			}
			if(doc[0].balance){
				resolve(true);
			}else{
				resolve(false);
			}
		})
	})
}



var allTransactions = [];
var latest = 5995950;
var startBlock = 5990000;
var endBlock = 5995950;

//use async await to control async process.
//first fetch block,then fetch transaction,then address in that transaction.

(async function(){
	console.log('started async function...');
	for(var a = startBlock;a < endBlock;a++){
		console.log('fetch block:',a);
		var can = await checkBlock(a);
		console.log(can);
		if(!can.canContinue){
			console.log('skip this block');
			continue
		}
		await updateBlock(a);
		await new Promise((resolve,reject)=>{
			web3.eth.getBlock(a,(err,res)=>{
				if(err){
					return {err:err,block:a};
				}else{
					console.log('transactions:',JSON.stringify(res.transactions));
					var txs = res.transactions;
					if(txs.length==0){
						console.log('no txs,skip this block.')
						resolve();
					}else{
						(async function(){
							var allAddress = [];
							for(let o = 0; o < txs.length; o++){
								console.log('fetch txs:',txs[o]);
								await new Promise((resolve,reject)=>{
									web3.eth.getTransaction(txs[o],(err,res)=>{
										if(err) {
											return {err:err,block:a,transaction:allTransactions[o]}
										}else{
											allAddress.push(res.from);
											allAddress.push(res.to);
										};
										(async function(){
											for(let p = 0; p < allAddress.length; p++){
												console.log('add new Address:',allAddress[p]);
												if(allAddress[p] =='undefined') {
													console.log('skip undefined address:',allAddress[p]);
													continue;
												}
												await addNewAccount(allAddress[p]);
										}
										}());
										resolve();
									})
								})
							}
						}());
						resolve();
					}
				}
			});
		})
	}
})();


//get balance of all the address in mongodb.
//you can do this step at end.
function getBalance(){
AccountModel.find({$where:'this.address!=undefined'},(err,docs)=>{
if(err) return console.log(err);
	console.log(docs.length);
	(async function(){
		for(let a = 0; a < docs.length; a++){
			var addr = docs[a].address;
			console.log('check addr:',addr);
			var bal = await checkBalance(addr);
			//skip the address checked
			if(bal){
				console.log('skip this addr.');
				continue
			}
			console.log('get balance of ',addr,'total:',docs.length,'now:',a);
			await new Promise((resolve,reject)=>{
				web3.eth.getBalance(addr,(err,doc)=>{
					var ether = toEth(doc-0);
					AccountModel.update({address:addr},{balance:ether},(err,doc)=>{
						if(err) return console.log(err);
						console.log('set balance %s of %s succeed.',ether,addr);
						resolve();
					})
				});
			});
		};
		console.log('finished get balance.....')
	}());
})
}
// getBalance()
