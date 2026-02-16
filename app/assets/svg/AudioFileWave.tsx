import React from 'react';

interface AudioFileWaveProps extends React.SVGProps<SVGSVGElement> {
  width?: string;
  height?: string;
  color?: string;
}

export const AudioFileWave: React.FC<AudioFileWaveProps> = ({
  width = '119',
  height = '56',
  color = '#8E979F',
  ...props
}) => (
  <svg width={width} height={height} viewBox="0 0 119 56" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect y="26.6139" width="3.04956" height="2.77228" rx="1.38614" fill={color} />
    <rect x="5.79736" y="24.3961" width="3.04956" height="7.20792" rx="1.52478" fill={color} />
    <rect x="11.5947" y="21.3465" width="3.04956" height="13.3069" rx="1.52478" fill={color} />
    <rect x="17.3926" y="23.2872" width="3.04956" height="9.42574" rx="1.52478" fill={color} />
    <rect x="23.1902" y="21.3465" width="3.04956" height="13.3069" rx="1.52478" fill={color} />
    <rect x="28.9875" y="17.7425" width="3.04956" height="20.5149" rx="1.52478" fill={color} />
    <rect x="34.7849" y="17.7425" width="3.04956" height="20.5149" rx="1.52478" fill={color} />
    <rect x="40.5825" y="14.9702" width="3.04956" height="26.0594" rx="1.52478" fill={color} />
    <rect x="46.3804" y="10.8118" width="3.04956" height="34.3762" rx="1.52478" fill={color} />
    <rect x="52.178" y="5.26732" width="3.04956" height="45.4653" rx="1.52478" fill={color} />
    <rect x="57.9751" width="3.04956" height="56" rx="1.52478" fill={color} />
    <rect x="63.7727" y="4.1584" width="3.04956" height="47.6832" rx="1.52478" fill={color} />
    <rect x="69.5703" y="10.2574" width="3.04956" height="35.4852" rx="1.52478" fill={color} />
    <rect x="75.3679" y="16.6337" width="3.04956" height="22.7327" rx="1.52478" fill={color} />
    <rect x="81.1653" y="16.0792" width="3.04956" height="23.8416" rx="1.52478" fill={color} />
    <rect x="86.9629" y="15.8019" width="3.04956" height="24.396" rx="1.52478" fill={color} />
    <rect x="92.7603" y="18.2971" width="3.04956" height="19.4059" rx="1.52478" fill={color} />
    <rect x="98.5579" y="22.1782" width="3.04956" height="11.6436" rx="1.52478" fill={color} />
    <rect x="104.355" y="24.6732" width="3.04956" height="6.65347" rx="1.52478" fill={color} />
    <rect x="110.153" y="22.1782" width="3.04956" height="11.6436" rx="1.52478" fill={color} />
    <rect x="115.95" y="26.0594" width="3.04956" height="3.88119" rx="1.52478" fill={color} />
  </svg>
);
