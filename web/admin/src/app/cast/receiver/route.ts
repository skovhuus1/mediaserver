const receiverHtml = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BoltBytes Cast</title><style>html,body,cast-media-player{width:100%;height:100%;margin:0;background:#050708}</style>
<script src="https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js"></script></head>
<body><cast-media-player></cast-media-player><script>(()=>{
const context=cast.framework.CastReceiverContext.getInstance();const player=context.getPlayerManager();
let heartbeatUrl=null;let timer=null;
const runtimeState=()=>{const value=String(player.getPlayerState()||'').toLowerCase();if(value.includes('buffer'))return'buffering';if(value.includes('pause'))return'paused';if(value.includes('play'))return'playing';return'idle'};
const heartbeat=async()=>{if(!heartbeatUrl)return;const media=player.getMediaInformation();const duration=Number(media&&media.duration);try{await fetch(heartbeatUrl,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({runtimeState:runtimeState(),positionMs:Math.max(0,Math.round(Number(player.getCurrentTimeSec()||0)*1000)),durationMs:Number.isFinite(duration)?Math.max(0,Math.round(duration*1000)):undefined,bufferAheadMs:0})})}catch(_){}};
player.setMessageInterceptor(cast.framework.messages.MessageType.LOAD,(request)=>{heartbeatUrl=request&&request.media&&request.media.customData?request.media.customData.heartbeatUrl||null:null;if(timer)clearInterval(timer);timer=setInterval(heartbeat,5000);heartbeat();return request});
player.addEventListener(cast.framework.events.EventType.MEDIA_FINISHED,heartbeat);context.start({disableIdleTimeout:true});
})()</script></body></html>`;

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(receiverHtml, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'content-security-policy': "default-src 'self' https://www.gstatic.com; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src *; media-src * blob:; img-src * data: blob:",
    },
  });
}
