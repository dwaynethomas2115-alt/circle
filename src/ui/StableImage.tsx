import React, { useEffect, useRef, useState } from "react";
import { Image, type ImageProps } from "react-native";
import { useCircle } from "../state/CircleProvider";
import { observeImageDimensions } from "../lib/imageDimensions";
import {
  imageAccessScope,
  imageMediaIdentity,
  isSignedPrivateImage,
} from "../lib/imageLoading";

type Props = Omit<ImageProps, "source"> & {
  uri: string;
  circleId?: string;
  onDimensions?: (size: { width: number; height: number }) => void;
};

/** A scope change replaces the rendered image. No persistent/global cache is
 * introduced; browser/OS caches and bytes already delivered cannot be erased here.
 */
export function useImageAccessScope(circleId?: string): string {
  const { state, user, authStatus, mode } = useCircle();
  return `${mode}:${authStatus || mode}:${imageAccessScope(user?.id, state.members, circleId)}`;
}

/** Keep a successfully drawn image through signature rotation. This component
 * adds no external URL/byte cache or cross-mount success flag. A fresh
 * mount, explicit retry, or real resource/scope change always uses the latest
 * authorized URI. Expired requests receive no extended access.
 */
export function StableImage({ uri, circleId, ...props }: Props) {
  const scope = useImageAccessScope(circleId);
  const { mode, authStatus, user } = useCircle();
  if (
    isSignedPrivateImage(uri) &&
    mode === "appwrite" &&
    (authStatus !== "authenticated" || !user)
  )
    return null;
  return (
    <MountedImage
      key={`${scope}:${imageMediaIdentity(uri)}`}
      uri={uri}
      {...props}
    />
  );
}

function MountedImage({
  uri,
  onDimensions,
  ...props
}: Omit<Props, "circleId">) {
  const latestUri = useRef(uri);
  latestUri.current = uri;
  const [source, setSource] = useState({ uri, attempt: 0 });
  const failed = useRef(false);
  const requestKey = `${source.attempt}:${source.uri}`;
  const activeRequest = useRef(requestKey);
  activeRequest.current = requestKey;
  const imageNode = useRef<Image>(null);
  const dimensionsCleanup = useRef<() => void>(() => {});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dimensionsCleanup.current();
    };
  }, []);
  useEffect(() => () => dimensionsCleanup.current(), [requestKey]);

  function retry(next: string) {
    failed.current = false;
    setSource((previous) => ({ uri: next, attempt: previous.attempt + 1 }));
  }
  useEffect(() => {
    // A failed old request may recover once a newly authorized URL arrives.
    // Keeping the same failed URL never starts an automatic retry loop.
    if (failed.current && uri !== source.uri) retry(uri);
  }, [uri, source.uri]);
  return (
    <Image
      {...props}
      ref={imageNode}
      key={requestKey}
      source={{ uri: source.uri }}
      onLoad={(event) => {
        if (activeRequest.current !== requestKey) return;
        failed.current = false;
        props.onLoad?.(event);
        if (onDimensions) {
          dimensionsCleanup.current();
          dimensionsCleanup.current = observeImageDimensions(
            event,
            imageNode.current,
            (size) => {
              if (mounted.current && activeRequest.current === requestKey)
                onDimensions(size);
            },
          );
        }
      }}
      onError={(event) => {
        if (activeRequest.current !== requestKey) return;
        failed.current = true;
        const latest = latestUri.current;
        if (latest !== source.uri) retry(latest);
        else props.onError?.(event);
      }}
    />
  );
}
