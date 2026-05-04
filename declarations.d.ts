// CSS modules và global CSS imports
declare module '*.css' {
  const content: Record<string, string>
  export default content
}

// SVG imports
declare module '*.svg' {
  const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>
  export default content
}