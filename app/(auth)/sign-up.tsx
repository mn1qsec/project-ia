import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Screen } from '../../components/ui/Screen';
import { Colors } from '../../constants/Colors';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name,
          }
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          setError('Este e-mail já está cadastrado.');
        } else {
          setError(`Erro: ${error.message}`);
        }
      }
    } catch (err) {
      setError('Ocorreu um erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scrollable>
      <View style={styles.header}>
        <Text style={styles.title}>Criar Conta</Text>
        <Text style={styles.subtitle}>Junte-se a nós e não perca o foco.</Text>
      </View>

      <View style={styles.form}>
        <Input
          label="Nome"
          placeholder="Como quer ser chamado?"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          autoCapitalize="words"
        />
        <Input
          label="E-mail"
          placeholder="Seu melhor e-mail"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Senha"
          placeholder="No mínimo 8 caracteres"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setError(null);
          }}
          secureTextEntry
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Button
          title="Cadastrar"
          onPress={handleSignUp}
          loading={loading}
          style={styles.button}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Já tem uma conta? </Text>
        <Link href="/(auth)/login" asChild>
          <Text style={styles.link}>Entrar</Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 60,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  form: {
    flex: 1,
  },
  button: {
    marginTop: 24,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    marginTop: -8,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  link: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
