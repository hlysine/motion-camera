import { Skia, SkImageFilter } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  Camera,
  NativeBuffer,
  useCameraDevice,
  useCameraPermission,
  useSkiaFrameProcessor,
} from 'react-native-vision-camera';

const MAX_FRAME_COUNT = 6;
const shaderInputNames = Array.from({ length: MAX_FRAME_COUNT }, (_, i) => `frame${i}`);

declare global {
  var frameQueue: NativeBuffer[];
}

export default function Index() {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [attenuation, setAttenuation] = useState(0.5);
  const [amplification, setAmplification] = useState(16);
  const [frameCount, setFrameCount] = useState(MAX_FRAME_COUNT);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const motionAmpShaderProgram = useMemo(() => {
    return Skia.RuntimeEffect.Make(`
      uniform float attenuation;
      uniform float amplification;
      uniform float frameCount;
      ${shaderInputNames
        .map(name => `      uniform shader ${name};`)
        .join('\n')
        .trim()}

      vec4 main(vec2 fragCoord) {
        vec4 currentColor = frame0.eval(fragCoord);
        vec3 prevColor = frame1.eval(fragCoord).rgb / (frameCount - 1);
        ${Array.from(
          { length: MAX_FRAME_COUNT - 2 },
          (_, i) => `
        if (frameCount > ${i + 2}) {
          prevColor += frame${i + 2}.eval(fragCoord).rgb / (frameCount - 1);
        }
        `
        )
          .join('\n')
          .trim()}
        return vec4(currentColor.rgb * attenuation + (currentColor.rgb - prevColor) * amplification, currentColor.a);
      }
    `);
  }, []);

  const motionAmpShader = useMemo(() => {
    const builder = Skia.RuntimeShaderBuilder(motionAmpShaderProgram!);
    builder.setUniform('attenuation', [attenuation]);
    builder.setUniform('amplification', [amplification]);
    builder.setUniform('frameCount', [frameCount]);
    return builder;
  }, [motionAmpShaderProgram, attenuation, amplification, frameCount]);

  const frameProcessor = useSkiaFrameProcessor(
    frame => {
      'worklet';

      if (!global.frameQueue) {
        global.frameQueue = [];
      }

      global.frameQueue.unshift(frame.getNativeBuffer());
      if (global.frameQueue.length > frameCount) {
        const removedFrames = global.frameQueue.splice(frameCount, global.frameQueue.length);
        removedFrames.forEach(frame => {
          frame.delete();
        });
      }
      const inputs: (SkImageFilter | null)[] = global.frameQueue.map(frame =>
        Skia.ImageFilter.MakeImage(Skia.Image.MakeImageFromNativeBuffer(frame.pointer))
      );
      const imageFilter = Skia.ImageFilter.MakeRuntimeShaderWithChildren(motionAmpShader, 0, shaderInputNames, inputs);
      const paint = Skia.Paint();
      paint.setImageFilter(imageFilter);
      frame.render(paint);
      inputs.forEach(input => {
        input?.dispose?.();
      });
    },
    [frameCount, motionAmpShader]
  );

  if (!hasPermission) return <Text>No permission to use camera</Text>;
  if (device == null) return <Text>No back camera device found</Text>;
  return (
    <>
      <Camera style={styles.absoluteFill} device={device} frameProcessor={frameProcessor} isActive={true} />
      {/* <View style={styles.absoluteBottom}>
        <Text style={styles.text}>Sensitivity: {sensitivity.toFixed(2)}</Text>
        <Slider
          style={styles.slider}
          value={sensitivity}
          min={0}
          max={2}
          steps={0}
          onValueChange={value => {
            setSensitivity(value);
          }}
        />
      </View> */}
    </>
  );
}

const styles = StyleSheet.create({
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  absoluteBottom: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    bottom: 16,
    left: 16,
    right: 16,
    gap: 16,
  },
  slider: {
    padding: 16,
    alignSelf: 'stretch',
  },
  text: {
    color: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    fontSize: 16,
    textAlign: 'center',
    width: 'auto',
  },
});
