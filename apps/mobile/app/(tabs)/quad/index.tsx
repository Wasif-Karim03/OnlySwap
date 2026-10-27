import { Redirect, useLocalSearchParams } from 'expo-router';

// DEC 130: the Quad lives inside the Feed as a chip. Old /quad links (and
// /quad?sort=new after posting) open the Feed on that chip.
export default function QuadRoute() {
  const { sort } = useLocalSearchParams<{ sort?: string }>();
  return (
    <Redirect
      href={{ pathname: '/feed', params: sort ? { kind: 'quad', sort } : { kind: 'quad' } }}
    />
  );
}
