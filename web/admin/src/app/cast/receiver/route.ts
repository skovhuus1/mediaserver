const receiverHtml = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BoltBytes Cast</title><style>html,body,cast-media-player{width:100%;height:100%;margin:0;background:#050708}</style>
<script src="https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js"></script></head>
<body><cast-media-player></cast-media-player><script>(()=>{
const context=cast.framework.CastReceiverContext.getInstance();const player=context.getPlayerManager();
let telemetry=null;let timer=null;let previousState='starting';let stallCount=0;
const runtimeState=()=>{const value=String(player.getPlayerState()||'').toLowerCase();if(value.includes('buffer'))return'buffering';if(value.includes('pause'))return'paused';if(value.includes('play'))return'playing';return'starting'};
const heartbeat=async()=>{if(!telemetry||!telemetry.heartbeatUrl)return;const state=runtimeState();if(state==='buffering'&&previousState!=='buffering')stallCount+=1;previousState=state;const media=player.getMediaInformation();const mediaDuration=Number(media&&media.duration);const localPosition=Math.max(0,Math.round(Number(player.getCurrentTimeSec()||0)*1000));const duration=Number(telemetry.fullDurationMs);try{await fetch(telemetry.heartbeatUrl,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({runtimeState:state,positionMs:Math.max(0,Number(telemetry.timelineOffsetMs||0)+localPosition),durationMs:Number.isFinite(duration)&&duration>0?Math.round(duration):Number.isFinite(mediaDuration)?Math.max(0,Math.round(mediaDuration*1000)):undefined,currentBitrate:telemetry.currentBitrate||null,currentHeight:telemetry.currentHeight||null,bufferAheadMs:null,stallCount:stallCount,playbackRate:1,subtitleTrack:telemetry.subtitleTrack||null})})}catch(_){}};
player.setMessageInterceptor(cast.framework.messages.MessageType.LOAD,(request)=>{telemetry=request&&request.media&&request.media.customData?request.media.customData:null;previousState='starting';stallCount=0;if(timer)clearInterval(timer);timer=setInterval(heartbeat,5000);heartbeat();return request});
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
