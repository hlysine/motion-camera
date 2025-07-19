import { Slider } from '@expo/ui/jetpack-compose';
import { Skia } from '@shopify/react-native-skia';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  NativeBuffer,
  useCameraDevice,
  useCameraPermission,
  useSkiaFrameProcessor,
} from 'react-native-vision-camera';

declare global {
  var previousFrameData: NativeBuffer | null;
}

export default function Index() {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [sensitivity, setSensitivity] = React.useState(0);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const frameProcessor = useSkiaFrameProcessor(
    frame => {
      'worklet';
      if (!global.previousFrameData) {
        global.previousFrameData = null;
      }
      const paint = Skia.Paint();
      if (global.previousFrameData) {
        const previousFrame = Skia.Image.MakeImageFromNativeBuffer(global.previousFrameData.pointer);
        const previousFrameFilter = Skia.ImageFilter.MakeImage(previousFrame);
        const imageFilter = Skia.ImageFilter.MakeArithmetic(
          0,
          -Math.pow(10, sensitivity),
          Math.pow(10, sensitivity),
          0,
          false,
          previousFrameFilter
        );
        paint.setImageFilter(imageFilter);
      }
      frame.render(paint);
      global.previousFrameData = frame.getNativeBuffer();
    },
    [sensitivity]
  );

  if (!hasPermission) return <Text>No permission to use camera</Text>;
  if (device == null) return <Text>No back camera device found</Text>;
  return (
    <>
      <Camera style={styles.absoluteFill} device={device} frameProcessor={frameProcessor} isActive={true} />
      <View style={styles.absoluteBottom}>
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
      </View>
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
