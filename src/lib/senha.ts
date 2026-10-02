/**
 * Tamanho mínimo de uma senha NOVA (cadastro, redefinição, criação e troca de
 * senha de motoboy). O login continua aceitando 6: contas criadas antes desta
 * regra têm senha de 6 e 7 caracteres, e recusá-las no login trancaria o dono
 * para fora do próprio restaurante.
 */
export const SENHA_MINIMA = 8;

export const MENSAGEM_SENHA_MINIMA = `Senha deve ter pelo menos ${SENHA_MINIMA} caracteres`;
