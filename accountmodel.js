let mongoose = require('mongoose');

//connect to your mongodb
mongoose.connect('mongodb://127.0.0.1:27017/eth_accounts',{ useNewUrlParser: true },(err)=>{
	console.log('connected to mongodb.');
});
//create Schema
var AccountSchema = new mongoose.Schema({
	number:Number,
	address:String,
	balance:String,
	txs:Number,
	block:Number
})

//createModel and export it
AccountModel = mongoose.model('AccountModel',AccountSchema);
module.exports = AccountModel;