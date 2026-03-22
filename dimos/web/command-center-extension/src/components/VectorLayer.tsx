import * as React from "react";

import { Vector } from "../types";
// Ensure this image is located in the same directory as this file,
// or adjust the import path to match where you saved it.
// @ts-ignore
import go2TopdownIcon from "../go2-topdown.png";

interface VectorLayerProps {
  vector: Vector;
  label: string;
  worldToPx: (x: number, y: number) => [number, number];
}

const VectorLayer = React.memo<VectorLayerProps>(({ vector, label, worldToPx }) => {
  const [cx, cy] = worldToPx(vector.coords[0]!, vector.coords[1]!);
  const text = `${label} (${vector.coords[0]!.toFixed(2)}, ${vector.coords[1]!.toFixed(2)})`;
  
  // Safely default to 0 if the vector only has x and y (length of 2)
  const yaw = vector.coords.length > 2 ? vector.coords[2]! : 0;
  // We add 90 degrees offset because the top-down sprite is rotated
  const rotationDegrees = -((yaw * 180) / Math.PI) - 90;

  return (
    <>
      <g className="vector-marker" transform={`translate(${cx}, ${cy}) rotate(${rotationDegrees})`}>
        {/* Draw the top-down Go2 icon centered */}
        <image
          href={go2TopdownIcon}
          x={-30}
          y={-30}
          width={60}
          height={60}
        />
      </g>
      <g>
        <rect
          x={cx + 34}
          y={cy + 14}
          width={text.length * 7}
          height={18}
          fill="black"
          stroke="black"
          opacity={0.75}
        />
        <text
          x={cx + 38}
          y={cy + 27}
          width={100}
          height={100}
          fill="white"
          fontSize={12}
          fontFamily={'monospace'}
        >
          {text}
        </text>
      </g>
    </>
  );
});

VectorLayer.displayName = "VectorLayer";

export default VectorLayer;
