// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DAO de votaciones para un Centro de Estudiantes
/// @notice Version simple: un admin registra estudiantes, cualquier estudiante
///         crea propuestas, cada estudiante vota una sola vez por propuesta.
contract CentroEstudiantesDAO {
    // ---------------------------------------------------------------
    // Estudiantes
    // ---------------------------------------------------------------
    address public admin;                       // quien da de alta / baja estudiantes
    mapping(address => bool) public esEstudiante;
    mapping(address => uint256) public registradoEn; // timestamp de alta
    uint256 public totalEstudiantes;

    // ---------------------------------------------------------------
    // Propuestas
    // ---------------------------------------------------------------
    enum Estado { Activa, Aprobada, Rechazada, SinQuorum }

    struct Propuesta {
        string titulo;          // Regla 4: sobre que es la votacion
        string descripcion;
        address creador;
        uint256 inicio;
        uint256 fin;            // Regla 3: duracion configurable
        uint256 padron;         // cantidad de estudiantes al crearse (para el quorum)
        uint256 votosSi;
        uint256 votosNo;
        Estado estado;
    }

    Propuesta[] public propuestas;
    // Regla 1: un voto por estudiante por propuesta
    mapping(uint256 => mapping(address => bool)) public yaVoto;

    // ---------------------------------------------------------------
    // Eventos
    // ---------------------------------------------------------------
    event EstudianteAgregado(address estudiante);
    event EstudianteQuitado(address estudiante);
    event PropuestaCreada(uint256 id, string titulo, uint256 fin);
    event Voto(uint256 id, address estudiante, bool aFavor);
    event PropuestaEjecutada(uint256 id, Estado resultado);

    modifier soloAdmin() {
        require(msg.sender == admin, "Solo el admin");
        _;
    }

    modifier soloEstudiante() {
        require(esEstudiante[msg.sender], "No sos estudiante registrado");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------------------------------------------------------------
    // Padron de estudiantes
    // ---------------------------------------------------------------
    function agregarEstudiantes(address[] calldata lista) external soloAdmin {
        for (uint256 i = 0; i < lista.length; i++) {
            address e = lista[i];
            if (e != address(0) && !esEstudiante[e]) {
                esEstudiante[e] = true;
                registradoEn[e] = block.timestamp;
                totalEstudiantes++;
                emit EstudianteAgregado(e);
            }
        }
    }

    function quitarEstudiante(address e) external soloAdmin {
        require(esEstudiante[e], "No esta registrado");
        esEstudiante[e] = false;
        totalEstudiantes--;
        emit EstudianteQuitado(e);
    }

    function cambiarAdmin(address nuevo) external soloAdmin {
        require(nuevo != address(0), "Direccion invalida");
        admin = nuevo;
    }

    // ---------------------------------------------------------------
    // Propuestas y votacion
    // ---------------------------------------------------------------

    /// @param duracionSegundos cuanto dura la votacion (ej: 3 dias = 259200)
    function crearPropuesta(
        string calldata titulo,
        string calldata descripcion,
        uint256 duracionSegundos
    ) external soloEstudiante returns (uint256 id) {
        require(bytes(titulo).length > 0, "Falta el titulo");
        require(duracionSegundos > 0, "Duracion invalida");

        id = propuestas.length;
        propuestas.push(Propuesta({
            titulo: titulo,
            descripcion: descripcion,
            creador: msg.sender,
            inicio: block.timestamp,
            fin: block.timestamp + duracionSegundos,
            padron: totalEstudiantes,
            votosSi: 0,
            votosNo: 0,
            estado: Estado.Activa
        }));

        emit PropuestaCreada(id, titulo, block.timestamp + duracionSegundos);
    }

    function votar(uint256 id, bool aFavor) external soloEstudiante {
        Propuesta storage p = propuestas[id];
        require(p.estado == Estado.Activa, "La votacion ya termino");
        require(block.timestamp < p.fin, "Periodo de votacion cerrado");
        require(!yaVoto[id][msg.sender], "Ya votaste");
        // Solo votan quienes estaban en el padron al crearse la propuesta
        require(registradoEn[msg.sender] <= p.inicio, "Te registraste despues de crearse");

        yaVoto[id][msg.sender] = true;
        if (aFavor) p.votosSi++; else p.votosNo++;

        emit Voto(id, msg.sender, aFavor);
    }

    /// @notice Regla 2: hay quorum cuando voto mas de la mitad del padron.
    function hayQuorum(uint256 id) public view returns (bool) {
        Propuesta storage p = propuestas[id];
        return (p.votosSi + p.votosNo) * 2 > p.padron;
    }

    /// @notice Cierra la votacion y registra el resultado on-chain.
    ///         Solo se puede llamar una vez vencido el plazo; cualquiera puede hacerlo.
    ///         Si no voto mas de la mitad del padron, queda "SinQuorum".
    function ejecutar(uint256 id) external {
        Propuesta storage p = propuestas[id];
        require(p.estado == Estado.Activa, "Ya fue ejecutada");
        require(block.timestamp >= p.fin, "Todavia no termino el periodo de votacion");

        if (!hayQuorum(id)) {
            p.estado = Estado.SinQuorum;
        } else if (p.votosSi > p.votosNo) {
            p.estado = Estado.Aprobada;
        } else {
            p.estado = Estado.Rechazada; // empate = rechazada
        }

        emit PropuestaEjecutada(id, p.estado);
    }

    function cantidadPropuestas() external view returns (uint256) {
        return propuestas.length;
    }
}
