# DAO Centro de Estudiantes

DAO mínima para que el centro de estudiantes vote propuestas: **un estudiante, un voto**.
HTML + JS plano con ethers.js v6 y MetaMask, sin build. No usa tokens ni NFTs: el derecho a voto sale de un padrón de wallets.

Funciona **solo en Sepolia**: si MetaMask está en otra red, la app pide cambiar a Sepolia.

## Cómo funciona
- **Padrón:** el admin (la wallet que desplegó el contrato) carga la wallet de cada estudiante. Una wallet = un voto.
- **Proponer:** cualquier estudiante del padrón crea una propuesta con título, descripción y duración.
- **Votar:** cada estudiante vota Sí o No una sola vez por propuesta, hasta que vence el plazo. Solo votan quienes ya estaban en el padrón cuando se creó la propuesta.
- **Cerrar:** cuando vence el plazo, cualquiera la cierra y el resultado queda registrado on-chain:
  - **Aprobada:** votó más de la mitad del padrón y hay más Sí que No.
  - **Rechazada:** hubo quórum y hay más No que Sí, o empate.
  - **Sin quórum:** votó la mitad del padrón o menos.

## La app
| Pestaña | Qué se hace |
| --- | --- |
| Votaciones | Ver las propuestas (abiertas, para cerrar y finalizadas), votar y cerrar las que vencieron. |
| Proponer | Crear una propuesta (solo estudiantes del padrón). |
| Padrón | Consultar si una wallet está en el padrón. El admin además agrega (hasta 50 por vez) y quita estudiantes. |

## Contrato
`contracts/CentroEstudiantesDAO.sol`

| Función | Qué hace |
| --- | --- |
| `agregarEstudiantes(address[])` | Solo admin. Agrega wallets al padrón (ignora repetidas y `0x0`). |
| `quitarEstudiante(address)` | Solo admin. Saca una wallet del padrón. |
| `cambiarAdmin(address)` | Solo admin. Pasa el rol de admin a otra wallet. |
| `crearPropuesta(titulo, descripcion, duracionSegundos)` | Solo estudiantes. Crea una propuesta. |
| `votar(id, aFavor)` | Solo estudiantes. Un voto por propuesta. |
| `ejecutar(id)` | Cualquiera, una vez vencido el plazo. Registra el resultado. |
| `propuestas(id)`, `cantidadPropuestas()`, `hayQuorum(id)`, `yaVoto(id, wallet)` | Consultas. |

El campo `estado` de una propuesta vale `0` Activa, `1` Aprobada, `2` Rechazada, `3` SinQuorum.

## Desplegar en Sepolia (Remix)
1. Pegá `contracts/CentroEstudiantesDAO.sol` en [remix.ethereum.org](https://remix.ethereum.org).
2. **Solidity Compiler:** compilá con 0.8.20 o superior (opcional: **Advanced Configurations → Enable optimization (200)** para gastar menos gas).
3. **Deploy & Run:** entorno *Injected Provider - MetaMask* en Sepolia, gas limit estimado. El constructor no tiene parámetros. La wallet que despliega queda como admin.
4. Copiá la dirección desplegada y pegala en `config.js` (`NETWORK.dao`).

**Desplegado en Sepolia:** `0xFD4ffA161d6232c00A39fC394b77c8D5aa8Fa1df` (ya precargado en `config.js`).

## Correr
```bash
cd apps/dao-centro-estudiantes
npx serve .
```
