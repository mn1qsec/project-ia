import { View, Text } from 'react-native';
import { Link } from 'expo-router';
import { Styles } from '../constants/Styles';

export default function NotFoundScreen() {
  return (
    <View style={Styles.container}>
      <Text style={Styles.title}>Página não encontrada!</Text>
      <Link href="/">
        <Text style={{ color: '#FF4500', marginTop: 20 }}>Voltar para a Home</Text>
      </Link>
    </View>
  );
}
