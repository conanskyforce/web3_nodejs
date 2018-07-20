
# 使用nodejs 爬取以太坊区块链数据

## 技术栈：node mongodb mongoose web3 pm2

> *目的:* 获取以太坊网络上边(所有)钱包的余额数量,交易数量等数据.(其实也可以用web3抓取数据,然后保存到自己数据库,做一个自己的区块链浏览器)  

> *思路:* 通过infura的接口(也可以自己下载geth客户端,然后自己作为一个节点,暴露api给web3),连接到以太坊主网络.
通过web3.eth.getBlock 方法遍历所有的区块,在所有的区块中遍历所有的transaction(web3.eth.getTransaction),然后再获取所有的transaction中交易双方的地址,这样就能收集到区块中所有有交易的以太坊钱包地址,
然后使用web3.eth.getBalance方法获取所有地址的余额.

* 预先准备
安装好nodejs,mongodb,  
然后：
npm i -S web3
npm i -S mongoose  

## 核心代码

//app.js
let Web3 = require('web3'),
		web3,
		mongoose = require('mongoose'),
		AccountModel = require('./accountmodel.js'),
		infura_live = 'https://mainnet.infura.io/v3/<你自己的appid>';
if( typeof web3 !== 'undefined'){
	web3 = new Web3(web3.currentProvider);
}else{
	web3 = new Web3(new Web3.providers.HttpProvider(infura_live));
}
function toEth(res){
	if(typeof res == 'number')return (res/(10**18)).toFixed(8);
}
//新增账户地址
function addNewAccount(newAddress){
	return new Promise((resolve,reject)=>{
		AccountModel.find({address:newAddress},(err,docs)=>{
			if(err) return console.log(err)
			if(docs.length!=0){
				console.log('address:'+newAddress+' exists!');
				resolve();
			}else{
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
//检查当前区块是否已经获取过了  
function checkBlock(newBlock){
	return new Promise((resolve,reject)=>{
		AccountModel.find({$where:'this.block!=undefined'},(err,doc)=>{
			if(err) return console.log(err);
			if(doc.length==0){
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
//更新最新区块
function updateBlock(newBlock){
	return new Promise((resolve,reject)=>{
		AccountModel.update({$where:'this.block!=undefined'},{block:newBlock},(err,doc)=>{
			if(err) return console.log(err)
			console.log('updateBlock succeed: ',newBlock);
			resolve();
		})
	})
}
//检查这个地址是否已经获取过了
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
var startBlock = 0;//可以自己指定,开始的几万个区块都没有什么交易
var latest = 5995950;//可以直接用web3.eth.getBlock('latest',.... 获取最新的区块
var endBlock = 10000;
(async function(){
	console.log('started async function...');
	for(var a = start; a < startBlock + endBlock; a++){
		console.log('fetch block:',a);
		var can = await checkBlock(a);
		//如果当前区块已经获取过了，则直接跳过
		if(!can.canContinue){
			console.log('skip this block');
			continue
		}
		//更新已获取区块
		await updateBlock(a);
		//获取这个块的内容
		await new Promise((resolve,reject)=>{
			web3.eth.getBlock(a,(err,res)=>{
				if(err){
					return {err:err,block:a};
				}else{
					//res.transactions 即为这个块含有的所有交易hash
					console.log('transactions:',JSON.stringify(res.transactions));
					var txs = res.transactions;
					//如果没有transaction，则直接跳过这个块
					if(txs.length==0){
						console.log('no txs,skip this block.')
						resolve();
					}else{
						//异步继发遍历所有交易hash
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
										//每获取到一个txs的时候，就去抓取这个transaction中的from,to数据，即交易的发送方和接收方.异步继发储存在mongodb.
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


//获取每一个地址的ether数量
function getBalance(){
AccountModel.find({$where:'this.address!=undefined'},(err,docs)=>{
if(err) return console.log(err);
	console.log(docs.length);
	(async function(){
		for(let a = 0; a < docs.length; a++){
			var addr = docs[a].address;
			console.log('check addr:',addr);
			var bal = await checkBalance(addr);
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


//accountmodel.js
let mongoose = require('mongoose');
//链接到mongodb的eth_accounts数据库
mongoose.connect('mongodb://127.0.0.1:27017/eth_accounts',{ useNewUrlParser: true },(err)=>{
	console.log('connected to mongodb.');
});
//创建一个Schema
var AccountSchema = new mongoose.Schema({
	number:Number,
	address:String,
	balance:String,
	txs:Number,
	block:Number
})

//创建并导出模型
AccountModel = mongoose.model('AccountModel',AccountSchema);
module.exports = AccountModel;

## 确保开启mongodb之后   
pm2 start app.js


