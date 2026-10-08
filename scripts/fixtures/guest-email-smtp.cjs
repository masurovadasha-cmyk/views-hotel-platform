'use strict';
// Disposable SMTP capture for the email identity proof. Never listens publicly.
const net=require('node:net');
module.exports=async function smtpCapture(){
 const messages=[],sockets=new Set();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.setTimeout(10000,()=>socket.destroy());socket.write('220 views.invalid synthetic capture\r\n');
  let buffer='',data=false,body='',recipient='';
  socket.on('data',chunk=>{
   buffer+=chunk.toString('utf8');if(buffer.length+body.length>65536){socket.destroy();return;}
   while(buffer.includes('\r\n')){
    const i=buffer.indexOf('\r\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+2);
    if(data){if(line==='.'){
     messages.push({recipient,raw:body});body='';data=false;socket.write('250 captured locally\r\n');
    }else body+=line.replace(/^\.\./,'.')+'\r\n';continue;}
    if(/^(EHLO|HELO)/i.test(line))socket.write('250 views.invalid\r\n');
    else if(/^MAIL FROM:/i.test(line))socket.write('250 OK\r\n');
    else if(/^RCPT TO:/i.test(line)){recipient=line.match(/<([^>]+)>/)?.[1]||'';socket.write(recipient.endsWith('@views.invalid')?'250 OK\r\n':'550 fixture recipients only\r\n');}
    else if(line==='DATA'){data=true;socket.write('354 End with dot\r\n');}
    else if(line==='QUIT')socket.end('221 Bye\r\n');
    else if(/^(RSET|NOOP)/.test(line))socket.write('250 OK\r\n');else socket.write('500 unsupported\r\n');
   }
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {port:server.address().port,messages,close:()=>new Promise(resolve=>{for(const socket of sockets)socket.destroy();server.close(resolve);})};
};
