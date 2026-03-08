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
    <View style={appStyles.authCard}>
      <Text style={appStyles.authCardTitle}>Accesso</Text>
      <TextInput
        style={appStyles.authInput}
        value={props.username}
        onChangeText={props.setUsername}
        autoCapitalize="none"
        placeholder="username"
        placeholderTextColor="#8ba09d"
      />
      <TextInput
        style={appStyles.authInput}
        value={props.password}
        onChangeText={props.setPassword}
        secureTextEntry
        placeholder="password"
        placeholderTextColor="#8ba09d"
      />
      <Pressable style={({ pressed }) => [appStyles.authButton, pressed ? appStyles.authButtonPressed : undefined]} onPress={props.onLogin}>
        <Text style={appStyles.authButtonText}>{props.token ? "Aggiorna token" : "Login token"}</Text>
      </Pressable>
      {props.token ? <Text style={appStyles.authTokenPreview}>Token attivo: {props.token.slice(0, 12)}...</Text> : null}
    </View>
  );
}
