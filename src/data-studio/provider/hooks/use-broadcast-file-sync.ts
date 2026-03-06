import { useCallback, useEffect, useRef } from "react";

/**
 * Cross-tab file change notifications via BroadcastChannel.
 */
export function useBroadcastFileSync(
  channelName: string,
  onRemoteChange: () => void,
) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;
    channel.onmessage = () => onRemoteChange();
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [channelName, onRemoteChange]);

  const broadcastFileChange = useCallback(() => {
    channelRef.current?.postMessage("changed");
  }, []);

  return { broadcastFileChange };
}
