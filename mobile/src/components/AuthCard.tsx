import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { appStyles } from "../styles";

type Props = {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  token: string;
  onLogin: () => void;
};

export function AuthCard(props: Props) {
  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Accesso</Text>
      <TextInput
        style={appStyles.input}
        value={props.username}
        onChangeText={props.setUsername}
        autoCapitalize="none"
        placeholder="username"
      />
      <TextInput
        style={appStyles.input}
        value={props.password}
        onChangeText={props.setPassword}
        secureTextEntry
        placeholder="password"
      />
      <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={props.onLogin}>
        <Text style={appStyles.buttonText}>{props.token ? "Aggiorna token" : "Login token"}</Text>
      </Pressable>
      {props.token ? <Text style={appStyles.tokenPreview}>Token attivo: {props.token.slice(0, 12)}...</Text> : null}
    </View>
  );
}
