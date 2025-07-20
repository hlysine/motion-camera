import { Button, Slider } from '@expo/ui/jetpack-compose';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Skia, SkImageFilter } from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
} from 'react-native-reanimated';
import {
  Camera,
  CameraPosition,
  CameraProps,
  NativeBuffer,
  Point,
  useCameraDevice,
  useCameraPermission,
  useSkiaFrameProcessor,
} from 'react-native-vision-camera';

const MAX_FRAME_COUNT = 6;
const shaderInputNames = Array.from({ length: MAX_FRAME_COUNT }, (_, i) => `frame${i}`);

declare global {
  var frameQueue: NativeBuffer[];
}

Reanimated.addWhitelistedNativeProps({
  zoom: true,
});
const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);

export default function Index() {
  const [attenuation, setAttenuation] = useState(0.5);
  const [amplification, setAmplification] = useState(4);
  const [position, setPosition] = useState<CameraPosition>('back');
  const device = useCameraDevice(position);
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);
  const zoom = useSharedValue(device?.neutralZoom ?? 1);

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
    builder.setUniform('attenuation', [1 - attenuation]);
    builder.setUniform('amplification', [Math.pow(2, amplification)]);
    builder.setUniform('frameCount', [MAX_FRAME_COUNT]);
    return builder;
  }, [motionAmpShaderProgram, attenuation, amplification]);

  const frameProcessor = useSkiaFrameProcessor(
    frame => {
      'worklet';

      if (!global.frameQueue) {
        global.frameQueue = [];
      }

      global.frameQueue.unshift(frame.getNativeBuffer());
      if (global.frameQueue.length > MAX_FRAME_COUNT) {
        const removedFrames = global.frameQueue.splice(MAX_FRAME_COUNT, global.frameQueue.length);
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
    [motionAmpShader]
  );

  const bottomSheetRef = useRef<BottomSheet>(null);

  const focus = useCallback((point: Point) => {
    const c = camera.current;
    if (c == null) return;
    c.focus(point);
    console.log(`Focusing at: ${point.x}, ${point.y}`);
  }, []);

  const tapGesture = Gesture.Tap().onEnd(({ x, y }) => {
    runOnJS(focus)({ x, y });
  });

  const zoomOffset = useSharedValue(0);
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      zoomOffset.value = zoom.value;
    })
    .onUpdate(event => {
      const z = zoomOffset.value * event.scale;
      zoom.value = interpolate(z, [1, 10], [device?.minZoom ?? 1, device?.maxZoom ?? 1], Extrapolation.CLAMP);
    });

  const animatedProps = useAnimatedProps<CameraProps>(() => ({ zoom: zoom.value }), [zoom]);

  if (!hasPermission) return <Text>No permission to use camera</Text>;
  if (device == null) return <Text>No camera device found</Text>;
  return (
    <GestureHandlerRootView style={styles.absoluteFill}>
      <GestureDetector gesture={pinchGesture}>
        <GestureDetector gesture={tapGesture}>
          <ReanimatedCamera
            ref={camera}
            style={styles.absoluteFill}
            device={device}
            frameProcessor={frameProcessor}
            isActive={true}
            animatedProps={animatedProps}
          />
        </GestureDetector>
      </GestureDetector>
      <View style={styles.absoluteBottom}>
        <View style={styles.horizontalFlex}>
          <Button
            style={styles.button}
            onPress={() => {
              setPosition(prev => (prev === 'back' ? 'front' : 'back'));
            }}
          >
            {position === 'back' ? 'Back' : 'Front'}
          </Button>
          <Button
            style={styles.button}
            onPress={() => {
              zoom.value = device?.neutralZoom ?? 1;
            }}
          >
            Reset zoom
          </Button>
          <Button
            style={styles.button}
            onPress={() => {
              bottomSheetRef.current?.expand();
            }}
          >
            Settings
          </Button>
        </View>
      </View>
      <BottomSheet enablePanDownToClose ref={bottomSheetRef} enableContentPanningGesture={false}>
        <BottomSheetView style={styles.contentContainer}>
          <Text style={styles.text}>Background attenuation: {attenuation.toFixed(2)}</Text>
          <Slider
            style={styles.slider}
            value={attenuation}
            min={0}
            max={1}
            steps={0}
            onValueChange={value => {
              setAttenuation(value);
            }}
          />
          <Text style={styles.text}>Motion amplification: {amplification.toFixed(2)}</Text>
          <Slider
            style={styles.slider}
            value={amplification}
            min={0}
            max={8}
            steps={0}
            onValueChange={value => {
              setAmplification(value);
            }}
          />
        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
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
  contentContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  absoluteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 16,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignContent: 'stretch',
  },
  horizontalFlex: {
    gap: 8,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignContent: 'stretch',
  },
  button: {
    width: '34%',
  },
  slider: {
    padding: 16,
    alignSelf: 'stretch',
  },
  text: {
    color: 'black',
    fontSize: 16,
    textAlign: 'center',
    width: 'auto',
  },
});
